import type { Request, Response } from "express";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationType,
} from "../services/notificationService.js";
import { HttpError, optionalString, parsePagination, positiveInt } from "../utils/validation.js";

const notificationTypes = new Set<NotificationType>([
  "CONTENT_PUBLISHED",
  "CONTENT_REVIEW_APPROVED",
  "CONTENT_REVIEW_LIMITED",
  "CONTENT_REVIEW_REQUIRED",
  "CONTENT_REVIEW_REJECTED",
  "CONTENT_REVIEW_FAILED",
  "COMMENT",
  "REPLY",
  "ARTICLE_REACTION",
  "COMMENT_REACTION",
  "FOLLOW",
]);

export async function listNotificationsController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query, 20, 50);
  const payload = await listNotifications({
    userId: req.auth!.id,
    types: optionalNotificationTypes(req.query.types ?? req.query.type),
    ...pagination,
  });
  res.json(payload);
}

export async function unreadNotificationCountController(req: Request, res: Response): Promise<void> {
  const count = await getUnreadNotificationCount(req.auth!.id);
  res.json({ count });
}

export async function markNotificationReadController(req: Request, res: Response): Promise<void> {
  const id = positiveInt(req.params.id, "id");
  const payload = await markNotificationRead(req.auth!.id, id);
  res.json(payload);
}

export async function markAllNotificationsReadController(req: Request, res: Response): Promise<void> {
  const payload = await markAllNotificationsRead(req.auth!.id);
  res.json(payload);
}

function optionalNotificationTypes(value: unknown): NotificationType[] | undefined {
  const raw = optionalString(value, "type", 512);
  if (!raw) return undefined;
  const types = [...new Set(raw.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))] as NotificationType[];
  for (const type of types) {
    if (!notificationTypes.has(type)) {
      throw new HttpError(400, "type is not a supported notification type", "VALIDATION_ERROR");
    }
  }
  return types.length > 0 ? types : undefined;
}
