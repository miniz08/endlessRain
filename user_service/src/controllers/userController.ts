import type { Request, Response } from "express";
import { writeAuditLog } from "../services/auditService.js";
import { resolveStoredImage, regularImageMaxBytes, smallImageMaxBytes, storeUploadedImage } from "../services/mediaService.js";
import {
  getPublicUserById,
  getUserRating,
  searchPublicUsers,
  updateUserProfile,
  updateUserRole,
} from "../services/userService.js";
import { HttpError, normalizeRole, optionalProfileBio, parsePositiveInt } from "../utils/validation.js";

export async function searchUsers(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = req.query.limit ? parsePositiveInt(req.query.limit, "limit") : 8;
  const items = q ? await searchPublicUsers(q, limit) : [];
  res.json({ items });
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id, "id");
  const user = await getPublicUserById(id);
  res.json({ user });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await getPublicUserById(req.auth!.id);
  res.json({ user });
}

export async function getRating(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id, "id");
  const rating = await getUserRating(id);
  res.json({ rating });
}

export async function patchUserRole(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id, "id");
  const role = normalizeRole(req.body?.role);
  if (!role) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "role is required" } });
    return;
  }
  const user = await updateUserRole(id, role);
  await writeAuditLog(req, "USER_ROLE_UPDATE", "success", 200, `user ${id} role -> ${role}`);
  res.json({ user });
}

export async function patchMe(req: Request, res: Response): Promise<void> {
  const bio = optionalProfileBio(req.body?.bio);
  if (bio === undefined) {
    throw new HttpError(400, "bio is required", "VALIDATION_ERROR");
  }

  const user = await updateUserProfile(req.auth!.id, { bio });
  await writeAuditLog(req, "USER_PROFILE_UPDATE", "success", 200, `user ${req.auth!.id}`);
  res.json({ user });
}

export async function uploadMyAvatar(req: Request, res: Response): Promise<void> {
  const media = await storeUploadedImage(req, smallImageMaxBytes());
  const user = await updateUserProfile(req.auth!.id, { avatar: media.url });
  await writeAuditLog(req, "USER_AVATAR_UPLOAD", "success", 201, `user ${req.auth!.id} avatar ${media.hash}`);
  res.status(201).json({ media, user });
}

export async function uploadMediaImage(req: Request, res: Response): Promise<void> {
  const kind = normalizeMediaKind(req.query.kind);
  const maxBytes = kind === "sticker" ? smallImageMaxBytes() : regularImageMaxBytes();
  const media = await storeUploadedImage(req, maxBytes);
  await writeAuditLog(req, "USER_MEDIA_UPLOAD", "success", 201, `${kind} ${media.hash}`);
  res.status(201).json({ media });
}

export async function getMediaImage(req: Request, res: Response): Promise<void> {
  const image = await resolveStoredImage(
    paramString(req.params.level1),
    paramString(req.params.level2),
    paramString(req.params.filename),
  );
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.type(image.mimeType);
  res.sendFile(image.filePath);
}

function normalizeMediaKind(value: unknown): "article" | "chat" | "sticker" {
  if (value === undefined || value === null || value === "") return "article";
  if (value === "article" || value === "chat" || value === "sticker") return value;
  throw new HttpError(400, "kind must be article, chat, or sticker", "VALIDATION_ERROR");
}

function paramString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
