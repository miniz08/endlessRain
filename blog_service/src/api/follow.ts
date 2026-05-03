import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import {
  followUserController,
  getFollowSummaryController,
  listFollowersController,
  listFollowingController,
  unfollowUserController,
} from "../controllers/followController.js";

export const followRouter = Router();

followRouter.get("/following", listFollowingController);
followRouter.get("/followers", listFollowersController);
followRouter.get("/users/:userId/follow-summary", getFollowSummaryController);
followRouter.post("/users/:userId/follow", requireAuth, followUserController);
followRouter.delete("/users/:userId/follow", requireAuth, unfollowUserController);
