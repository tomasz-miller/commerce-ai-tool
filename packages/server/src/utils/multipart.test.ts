import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_JSON_BODY_BYTES,
} from "../input-limits.js";
import { mapRouteError } from "../route-actions.js";
import {
  AUDIO_UPLOAD,
  IMAGE_UPLOAD,
  parseMultipart,
  readJsonBody,
  type UploadOptions,
} from "./multipart.js";

const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

/** Express/Node path: `parseMultipart` / `readJsonBody` behind a bare `http.Server`. */
function nodeServer(
  handle: (req: import("node:http").IncomingMessage) => Promise<unknown>,
): Server {
  const server = createServer(async (req, res) => {
    try {
      const body = await handle(req);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    } catch (error) {
      const mapped = mapRouteError(error, "test", "fallback");
      res.statusCode = mapped.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: mapped.message, code: mapped.code }));
    }
  });
  servers.push(server);
  return server;
}

function multipartServer(upload: UploadOptions): Server {
  return nodeServer(async (req) => {
    const { fields, file } = await parseMultipart(req, upload);
    return { fields, file: file && { ...file, buffer: file.buffer.length } };
  });
}

describe("parseMultipart (Node stream)", () => {
  it("accepts an image within the limit and returns fields and file", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .field("queryLocale", "en")
      .attach("image", Buffer.alloc(1024), { filename: "a.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.fields).toEqual({ queryLocale: "en" });
    expect(res.body.file.mimeType).toBe("image/png");
    expect(res.body.file.buffer).toBe(1024);
  });

  it("413 PAYLOAD_TOO_LARGE when an image exceeds MAX_IMAGE_BYTES", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .attach("image", Buffer.alloc(MAX_IMAGE_BYTES + 1), {
        filename: "big.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("413 before reading the body when Content-Length is far over the cap", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .attach("image", Buffer.alloc(MAX_IMAGE_BYTES + 256 * 1024), {
        filename: "big.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("413 when audio exceeds MAX_AUDIO_BYTES", async () => {
    const res = await supertest(multipartServer(AUDIO_UPLOAD))
      .post("/")
      .attach("audio", Buffer.alloc(MAX_AUDIO_BYTES + 1), {
        filename: "a.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("415 for image/gif", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .attach("image", Buffer.alloc(16), { filename: "a.gif", contentType: "image/gif" });

    expect(res.status).toBe(415);
    expect(res.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("415 for an audio type outside the allowlist", async () => {
    const res = await supertest(multipartServer(AUDIO_UPLOAD))
      .post("/")
      .attach("audio", Buffer.alloc(16), { filename: "a.bin", contentType: "application/octet-stream" });

    expect(res.status).toBe(415);
    expect(res.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("accepts audio/mp4 and audio/webm with codec parameters", async () => {
    for (const contentType of ["audio/mp4", "audio/webm;codecs=opus"]) {
      const res = await supertest(multipartServer(AUDIO_UPLOAD))
        .post("/")
        .attach("audio", Buffer.alloc(16), { filename: "a.bin", contentType });

      expect(res.status, contentType).toBe(200);
      expect(res.body.file.buffer).toBe(16);
    }
  });

  it("rejects a second file part", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .attach("image", Buffer.alloc(16), { filename: "a.png", contentType: "image/png" })
      .attach("image2", Buffer.alloc(16), { filename: "b.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("rejects more than 20 non-file fields", async () => {
    let req = supertest(multipartServer(IMAGE_UPLOAD)).post("/");
    for (let i = 0; i < 21; i += 1) {
      req = req.field(`f${i}`, "x");
    }
    const res = await req.attach("image", Buffer.alloc(16), {
      filename: "a.png",
      contentType: "image/png",
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("413 for an oversized text field", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .field("queryLocale", "x".repeat(32 * 1024))
      .attach("image", Buffer.alloc(16), { filename: "a.png", contentType: "image/png" });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("415 when the request is not multipart/form-data", async () => {
    const res = await supertest(multipartServer(IMAGE_UPLOAD))
      .post("/")
      .set("content-type", "application/json")
      .send({ a: 1 });

    expect(res.status).toBe(415);
    expect(res.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("readJsonBody (Node stream)", () => {
  const jsonServer = () => nodeServer((req) => readJsonBody(req));

  it("accepts a body at the cap", async () => {
    const padding = "x".repeat(MAX_JSON_BODY_BYTES - 20);
    const res = await supertest(jsonServer()).post("/").send({ a: padding });

    expect(res.status).toBe(200);
  });

  it("413 for a JSON body over 64 KB (Content-Length)", async () => {
    const res = await supertest(jsonServer())
      .post("/")
      .send({ a: "x".repeat(MAX_JSON_BODY_BYTES + 1) });

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("413 for a chunked JSON body over 64 KB (no Content-Length)", async () => {
    const server = jsonServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, method: "POST", headers: { "content-type": "application/json" } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.write('{"a":"');
      for (let i = 0; i < 4; i += 1) {
        req.write("x".repeat(MAX_JSON_BODY_BYTES / 2));
      }
      req.end('"}');
    });

    expect(status).toBe(413);
  });
});
