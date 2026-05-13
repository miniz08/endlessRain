import { Router } from "express";
import { login, logout, me, refresh, register, session } from "../controllers/authController.js";
import { optionalAuth, requireAuth } from "../../middlewares/auth.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/session", optionalAuth, session);
authRouter.get("/me", requireAuth, me);
