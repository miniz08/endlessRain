import type { Request, Response } from "express";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationService.js";
import { parsePagination, positiveInt } from "../utils/validation.js";

export async function listNotificationsController(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query, 20, 50);
  const payload = await listNotifications({
    userId: req.auth!.id,
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
