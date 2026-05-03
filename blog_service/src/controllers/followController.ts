import type { Request, Response } from "express";
import { writeAuditLog } from "../services/auditService.js";
import { followUser, getFollowSummary, listFollowers, listFollowing, unfollowUser } from "../services/followService.js";
import { recordFollowAuthorEvent } from "../services/recoEventService.js";
import { optionalPositiveInt, parsePagination, positiveInt } from "../utils/validation.js";

export async function followUserController(req: Request, res: Response): Promise<void> {
  const targetUserId = positiveInt(req.params.userId, "userId");
  const payload = await followUser(req.auth!.id, targetUserId);
  await recordFollowAuthorEvent({
    userId: req.auth!.id,
    followingId: targetUserId,
    articleId: optionalPositiveInt(req.body?.articleId, "articleId"),
    requestId: req.requestId,
  });
  await writeAuditLog(req, "FOLLOW_CREATE", "success", 200, `targetUser=${targetUserId}`);
  res.json(payload);
}

export async function unfollowUserController(req: Request, res: Response): Promise<void> {
  const targetUserId = positiveInt(req.params.userId, "userId");
  const payload = await unfollowUser(req.auth!.id, targetUserId);
  await writeAuditLog(req, "FOLLOW_REMOVE", "success", 200, `targetUser=${targetUserId}`);
  res.json(payload);
}

export async function listFollowingController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query, 30, 100);
  const userId = optionalPositiveInt(req.query.userId, "userId") ?? req.auth?.id;
  if (!userId) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "userId is required" } });
    return;
  }
  const payload = await listFollowing({
    userId,
    viewerId: req.auth?.id,
    ...pagination,
  });
  res.json(payload);
}

export async function listFollowersController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query, 30, 100);
  const userId = optionalPositiveInt(req.query.userId, "userId") ?? req.auth?.id;
  if (!userId) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "userId is required" } });
    return;
  }
  const payload = await listFollowers({
    userId,
    viewerId: req.auth?.id,
    ...pagination,
  });
  res.json(payload);
}

export async function getFollowSummaryController(req: Request, res: Response): Promise<void> {
  const userId = positiveInt(req.params.userId, "userId");
  const summary = await getFollowSummary(userId, req.auth?.id);
  res.json({ summary });
}
