import Busboy from "busboy";
import type { IncomingMessage } from "node:http";
import { SUPPORTED_AUDIO_MIME_TYPES } from "@commerce-ai-tool/core/internal";
import { HttpError, parseJsonBody, ValidationError } from "../errors.js";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_JSON_BODY_BYTES,
  normalizeMimeType,
  payloadTooLarge,
} from "../input-limits.js";

export interface ParsedMultipart {
  fields: Record<string, string>;
  file?: {
    buffer: Buffer;
    mimeType: string;
    filename?: string;
  };
}

/** What a multipart route accepts: one file of an allowed type up to `maxFileBytes`. */
export interface UploadOptions {
  /** Label used in error messages, e.g. "image". */
  label: string;
  maxFileBytes: number;
  allowedMimeTypes: readonly string[];
}

export const IMAGE_UPLOAD: UploadOptions = {
  label: "image",
  maxFileBytes: MAX_IMAGE_BYTES,
  allowedMimeTypes: ALLOWED_IMAGE_TYPES,
};

export const AUDIO_UPLOAD: UploadOptions = {
  label: "audio",
  maxFileBytes: MAX_AUDIO_BYTES,
  allowedMimeTypes: SUPPORTED_AUDIO_MIME_TYPES,
};

/** Room for text fields, part headers and boundaries on top of the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_FIELDS = 20;
const MAX_PARTS = MAX_FIELDS + 1;
const MAX_FIELD_VALUE_BYTES = 16 * 1024;

function maxMultipartBytes(upload: UploadOptions): number {
  return upload.maxFileBytes + MULTIPART_OVERHEAD_BYTES;
}

function declaredLength(value: string | string[] | null | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Above this, a rejected request's remaining body is no longer drained (the client may see a reset). */
const MAX_DRAIN_BYTES = 32 * 1024 * 1024;

/**
 * Rejects with `error` once the rest of the request body has been read and discarded (never
 * buffered). Answering before the client finished sending makes some clients fail with a
 * connection reset instead of showing the 413/415; body-parser drains first for the same
 * reason. Draining stops being awaited after MAX_DRAIN_BYTES, so an endless upload cannot hold
 * the response forever (Node still discards the remainder).
 */
function rejectAfterDrain(req: IncomingMessage, error: unknown, reject: (e: unknown) => void): void {
  let drained = 0;
  let done = false;
  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    req.off("data", onData);
    reject(error);
  };
  const onData = (chunk: Buffer | string) => {
    drained += chunk.length;
    if (drained > MAX_DRAIN_BYTES) {
      finish();
    }
  };

  if (req.readableEnded || req.destroyed) {
    finish();
    return;
  }
  req.on("data", onData);
  req.once("end", finish);
  req.once("close", finish);
  req.once("error", finish);
  req.resume();
}

function assertMultipartContentType(contentType: string | null | undefined): void {
  if (normalizeMimeType(contentType) !== "multipart/form-data") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be multipart/form-data");
  }
}

function assertUploadType(upload: UploadOptions, mimeType: string | undefined): void {
  if (!upload.allowedMimeTypes.includes(normalizeMimeType(mimeType))) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", `Unsupported ${upload.label} type`);
  }
}

/**
 * Parses a multipart upload from a Node request (Express path). Rejects before buffering: wrong
 * Content-Type (415), declared length over the cap (413), file type outside the allowlist (415),
 * file over `maxFileBytes` (413), more than one file or 20 fields (400). Nothing past the cap is
 * buffered; on rejection the rest of the request is drained and discarded.
 */
export async function parseMultipart(
  req: IncomingMessage,
  upload: UploadOptions,
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: ParsedMultipart["file"];
    let settled = false;
    let busboy: Busboy.Busboy | undefined;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      if (busboy) {
        req.unpipe(busboy);
      }
      rejectAfterDrain(req, error, reject);
    };

    try {
      assertMultipartContentType(req.headers["content-type"]);
      const declared = declaredLength(req.headers["content-length"]);
      if (declared !== undefined && declared > maxMultipartBytes(upload)) {
        throw payloadTooLarge(`Request body`, maxMultipartBytes(upload));
      }
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: upload.maxFileBytes,
          files: 1,
          fields: MAX_FIELDS,
          parts: MAX_PARTS,
          fieldSize: MAX_FIELD_VALUE_BYTES,
        },
      });
    } catch (error) {
      fail(error);
      return;
    }

    busboy.on("field", (name, value, info) => {
      if (info.valueTruncated) {
        fail(payloadTooLarge(`Field ${name}`, MAX_FIELD_VALUE_BYTES));
        return;
      }
      fields[name] = value;
    });

    busboy.on("file", (_name, stream, info) => {
      try {
        assertUploadType(upload, info.mimeType);
      } catch (error) {
        stream.resume();
        fail(error);
        return;
      }

      // Scoped to this file part so parts can never share a buffer.
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        fail(payloadTooLarge(`The ${upload.label} file`, upload.maxFileBytes));
      });
      stream.on("end", () => {
        if (stream.truncated) {
          fail(payloadTooLarge(`The ${upload.label} file`, upload.maxFileBytes));
          return;
        }
        file = {
          buffer: Buffer.concat(chunks),
          mimeType: info.mimeType,
          filename: info.filename,
        };
      });
    });

    busboy.on("filesLimit", () => fail(new ValidationError("Only one file may be uploaded")));
    busboy.on("fieldsLimit", () =>
      fail(new ValidationError(`At most ${MAX_FIELDS} form fields are allowed`)),
    );
    busboy.on("finish", () => {
      if (!settled) {
        settled = true;
        resolve({ fields, file });
      }
    });
    busboy.on("error", fail);
    // A request stream that fails mid-upload (client abort) is not piped into busboy's error
    // handling: without a listener it would be an uncaught exception and the promise would hang.
    req.once("error", () => fail(new ValidationError("Upload was interrupted")));
    req.pipe(busboy);
  });
}

/**
 * Reads a Node request body into memory, rejecting with 413 once it exceeds `maxBytes` (by
 * declared Content-Length first, then by counting bytes). Nothing past the cap is buffered; the
 * remainder is drained and discarded.
 */
function readNodeBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = declaredLength(req.headers?.["content-length"]);
    if (declared !== undefined && declared > maxBytes) {
      rejectAfterDrain(req, payloadTooLarge("Request body", maxBytes), reject);
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    let exceeded = false;
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        exceeded = true;
        req.off("data", onData);
        rejectAfterDrain(req, payloadTooLarge("Request body", maxBytes), reject);
        return;
      }
      chunks.push(buffer);
    };

    req.on("data", onData);
    req.once("end", () => {
      if (!exceeded) {
        resolve(Buffer.concat(chunks));
      }
    });
    req.once("error", () => reject(new ValidationError("Request body was interrupted")));
  });
}

/**
 * Reads the JSON body of a Node request. When a host body parser such as `express.json()` ran
 * first, its `req.body` is used (the stream is already consumed); it must still be a plain
 * object and, re-serialised, fit the 64 KB cap. Otherwise the stream is read under the cap.
 */
export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined) {
    const body = await parseJsonBody(async () => parsed);
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_JSON_BODY_BYTES) {
      throw payloadTooLarge("Request body", MAX_JSON_BODY_BYTES);
    }
    return body as T;
  }

  const raw = (await readNodeBody(req, MAX_JSON_BODY_BYTES)).toString("utf8");
  return (await parseJsonBody(async () => JSON.parse(raw))) as T;
}
