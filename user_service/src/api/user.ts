import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import { getRating, getUser, patchUserRole } from "../controllers/userController.js";

export const userRouter = Router();

userRouter.get("/:id", getUser);
userRouter.get("/:id/rating", getRating);
userRouter.patch("/:id/role", requireAuth, requireRole("admin"), patchUserRole);
