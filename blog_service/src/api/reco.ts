import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import { getMyProfileController, recordRecoEventController, refreshMyProfileController } from "../controllers/recoController.js";

export const recoRouter = Router();

recoRouter.post("/events", recordRecoEventController);
recoRouter.get("/profile/me", requireAuth, getMyProfileController);
recoRouter.post("/profile/me/refresh", requireAuth, refreshMyProfileController);
