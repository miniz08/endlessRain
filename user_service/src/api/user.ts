import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.js";
import {
  getMediaImage,
  getMe,
  getRating,
  getUser,
  patchMe,
  patchUserRole,
  searchUsers,
  uploadMediaImage,
  uploadMyAvatar,
} from "../controllers/userController.js";

export const userRouter = Router();

userRouter.get("/media/img/uni/:level1/:level2/:filename", getMediaImage);
userRouter.post("/media/images", requireAuth, uploadMediaImage);
userRouter.get("/me", requireAuth, getMe);
userRouter.patch("/me", requireAuth, patchMe);
userRouter.post("/me/avatar", requireAuth, uploadMyAvatar);
userRouter.get("/search", searchUsers);
userRouter.get("/:id", getUser);
userRouter.get("/:id/rating", getRating);
userRouter.patch("/:id/role", requireAuth, requireRole("admin"), patchUserRole);
