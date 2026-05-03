import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import { followingFeedController, recommendedFeedController } from "../controllers/feedController.js";

export const feedRouter = Router();

feedRouter.get("/following", requireAuth, followingFeedController);
feedRouter.get("/recommended", recommendedFeedController);
