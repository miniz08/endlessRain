import type { Request, Response } from "express";
import { listFollowingFeed, listRecommendedFeed } from "../services/feedService.js";
import { parsePagination } from "../utils/validation.js";

export async function followingFeedController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query);
  const payload = await listFollowingFeed({
    userId: req.auth!.id,
    requestId: req.requestId!,
    ...pagination,
  });
  res.json(payload);
}

export async function recommendedFeedController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query);
  const payload = await listRecommendedFeed({
    userId: req.auth?.id,
    requestId: req.requestId!,
    ...pagination,
  });
  res.json(payload);
}
