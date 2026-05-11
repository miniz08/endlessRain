import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import Busboy from "busboy";
import type { Request } from "express";
import { HttpError } from "../utils/validation.js";

export type StoredImage = {
  url: string;
  path: string;
  hash: string;
  size: number;
  mimeType: string;
};

type ImageType = {
  ext: "png" | "jpg" | "gif" | "webp";
  mimeType: string;
};

const MEDIA_ROUTE_PREFIX = "/media/img/uni";
const HASH_PART_PATTERN = /^[a-f0-9]{2}$/;
const HASH_FILE_PATTERN = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;

export function smallImageMaxBytes(): number {
  return positiveEnvNumber("MEDIA_SMALL_IMAGE_MAX_BYTES", 100 * 1024);
}

export function regularImageMaxBytes(): number {
  return positiveEnvNumber("MEDIA_IMAGE_MAX_BYTES", 2 * 1024 * 1024);
}

export async function storeUploadedImage(req: Request, maxBytes: number): Promise<StoredImage> {
  const upload = await readMultipartImage(req, maxBytes);
  const imageType = detectImageType(upload.buffer);
  if (!imageType) {
    throw new HttpError(400, "Only png, jpg, gif, and webp images are supported", "UNSUPPORTED_IMAGE_TYPE");
  }

  const hash = crypto.createHash("sha256").update(upload.buffer).digest("hex");
  const relativePath = path.posix.join(hash.slice(0, 2), hash.slice(2, 4), `${hash}.${imageType.ext}`);
  const filePath = path.join(mediaStorageRoot(), hash.slice(0, 2), hash.slice(2, 4), `${hash}.${imageType.ext}`);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeOnce(filePath, upload.buffer);

  return {
    url: `${publicMediaBase()}/${relativePath}`,
    path: relativePath,
    hash,
    size: upload.buffer.length,
    mimeType: imageType.mimeType,
  };
}

export async function resolveStoredImage(level1: string, level2: string, filename: string): Promise<{
  filePath: string;
  mimeType: string;
}> {
  if (!HASH_PART_PATTERN.test(level1) || !HASH_PART_PATTERN.test(level2) || !HASH_FILE_PATTERN.test(filename)) {
    throw new HttpError(404, "Image not found", "MEDIA_NOT_FOUND");
  }

  const root = mediaStorageRoot();
  const filePath = path.resolve(root, level1, level2, filename);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(404, "Image not found", "MEDIA_NOT_FOUND");
  }

  await fs.access(filePath, fsConstants.R_OK).catch(() => {
    throw new HttpError(404, "Image not found", "MEDIA_NOT_FOUND");
  });

  return {
    filePath,
    mimeType: mimeTypeFromFilename(filename),
  };
}

function mediaStorageRoot(): string {
  return path.resolve(process.env.MEDIA_STORAGE_ROOT ?? MEDIA_ROUTE_PREFIX);
}

function publicMediaBase(): string {
  return (process.env.MEDIA_PUBLIC_BASE ?? MEDIA_ROUTE_PREFIX).replace(/\/+$/, "");
}

function positiveEnvNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readMultipartImage(req: Request, maxBytes: number): Promise<{ buffer: Buffer }> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(415, "multipart/form-data is required", "UNSUPPORTED_MEDIA_TYPE");
  }

  return new Promise((resolve, reject) => {
    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: maxBytes,
      },
    });

    let found = false;
    let tooLarge = false;
    let total = 0;
    const chunks: Buffer[] = [];

    parser.on("file", (fieldName, file) => {
      if (fieldName !== "image") {
        file.resume();
        return;
      }
      if (found) {
        file.resume();
        tooLarge = true;
        return;
      }

      found = true;
      file.on("data", (chunk: Buffer) => {
        total += chunk.length;
        chunks.push(chunk);
      });
      file.on("limit", () => {
        tooLarge = true;
        file.resume();
      });
    });

    parser.on("error", reject);
    parser.on("finish", () => {
      if (!found) {
        reject(new HttpError(400, "image file is required", "IMAGE_REQUIRED"));
        return;
      }
      if (tooLarge || total > maxBytes) {
        reject(new HttpError(413, `image must be ${Math.floor(maxBytes / 1024)}KB or smaller`, "IMAGE_TOO_LARGE"));
        return;
      }
      const buffer = Buffer.concat(chunks, total);
      if (buffer.length === 0) {
        reject(new HttpError(400, "image file is empty", "IMAGE_EMPTY"));
        return;
      }
      resolve({ buffer });
    });

    req.pipe(parser);
  });
}

async function writeOnce(filePath: string, buffer: Buffer): Promise<void> {
  await fs.writeFile(filePath, buffer, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
}

function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mimeType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mimeType: "image/jpeg" };
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") {
      return { ext: "gif", mimeType: "image/gif" };
    }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", mimeType: "image/webp" };
  }
  return null;
}

function mimeTypeFromFilename(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg")) return "image/jpeg";
  if (filename.endsWith(".gif")) return "image/gif";
  return "image/webp";
}
