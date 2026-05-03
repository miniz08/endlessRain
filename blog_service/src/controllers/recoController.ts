import type { Request, Response } from "express";
import { recordRecoEvent, type RecoEventType } from "../services/recoEventService.js";
import { getUserProfile, refreshUserProfile } from "../services/userProfileService.js";
import {
  assertString,
  HttpError,
  optionalNonNegativeInt,
  optionalPositiveInt,
  optionalString,
  positiveInt,
} from "../utils/validation.js";

const recoEventTypes = new Set<RecoEventType>([
  "IMPRESSION",
  "CLICK",
  "DWELL",
  "READ_COMPLETE",
  "LIKE",
  "COMMENT",
  "FAVORITE",
  "FOLLOW_AUTHOR",
  "HIDE",
  "REPORT",
]);

export async function recordRecoEventController(req: Request, res: Response): Promise<void> {
  const articleId = positiveInt(req.body?.articleId, "articleId");
  const eventType = assertRecoEventType(req.body?.eventType);
  const event = await recordRecoEvent({
    userId: req.auth?.id,
    articleId,
    eventType,
    dwellMs: optionalNonNegativeInt(req.body?.dwellMs, "dwellMs"),
    position: optionalPositiveInt(req.body?.position, "position"),
    scene: optionalString(req.body?.scene, "scene") ?? "home",
    requestId: optionalString(req.body?.requestId, "requestId", 191) ?? req.requestId,
    sessionId: optionalString(req.body?.sessionId, "sessionId", 191) ?? readHeader(req, "x-session-id"),
  });

  res.status(201).json({ event });
}

export async function refreshMyProfileController(req: Request, res: Response): Promise<void> {
  const profile = await refreshUserProfile(req.auth!.id);
  res.json({ profile });
}

export async function getMyProfileController(req: Request, res: Response): Promise<void> {
  const profile = await getUserProfile(req.auth!.id);
  res.json({ profile });
}

function assertRecoEventType(value: unknown): RecoEventType {
  const eventType = assertString(value, "eventType", 64).toUpperCase() as RecoEventType;
  if (!recoEventTypes.has(eventType)) {
    throw new HttpError(400, `eventType must be one of ${[...recoEventTypes].join(", ")}`, "VALIDATION_ERROR");
  }
  return eventType;
}

function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
