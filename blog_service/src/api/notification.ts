import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import {
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
  unreadNotificationCountController,
} from "../controllers/notificationController.js";

export const notificationRouter = Router();

notificationRouter.get("/", requireAuth, listNotificationsController);
notificationRouter.get("/unread-count", requireAuth, unreadNotificationCountController);
notificationRouter.patch("/read-all", requireAuth, markAllNotificationsReadController);
notificationRouter.patch("/:id/read", requireAuth, markNotificationReadController);
