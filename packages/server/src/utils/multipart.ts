import Busboy from "busboy";
import type { IncomingMessage } from "node:http";

export interface ParsedMultipart {
  fields: Record<string, string>;
  file?: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  };
}

export async function parseMultipart(req: IncomingMessage): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: ParsedMultipart["file"];

    const busboy = Busboy({ headers: req.headers });
    const chunks: Buffer[] = [];

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (_name, stream, info) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        file = {
          buffer: Buffer.concat(chunks),
          mimeType: info.mimeType,
          filename: info.filename,
        };
      });
    });

    busboy.on("finish", () => resolve({ fields, file }));
    busboy.on("error", reject);
    req.pipe(busboy);
  });
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as T;
}

export async function readRequestBuffer(req: Request): Promise<Buffer> {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function parseMultipartRequest(req: Request): Promise<ParsedMultipart> {
  const formData = await req.formData();
  const fields: Record<string, string> = {};
  let file: ParsedMultipart["file"];

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }

    const buffer = Buffer.from(await value.arrayBuffer());
    file = {
      buffer,
      mimeType: value.type || "application/octet-stream",
      filename: value.name,
    };
  }

  return { fields, file };
}
