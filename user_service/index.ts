import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./src/api/auth.js";
import { userRouter } from "./src/api/user.js";
import { writeAuditLog } from "./src/services/auditService.js";
import { HttpError } from "./src/utils/validation.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3003);
const corsOrigin = process.env.CORS_ORIGIN ?? true;

app.disable("x-powered-by");
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(assignRequestId);

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    service: "user_service",
    status: "ok",
    time: new Date().toISOString(),
  });
});

app.use("/auth", authRouter);
app.use("/users", userRouter);

app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found", "NOT_FOUND"));
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`[user_service] listening on ${port}`);
});

function assignRequestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  req.requestId = typeof incoming === "string" && incoming.trim() ? incoming : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}

async function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): Promise<void> {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : "Internal server error";

  if (statusCode >= 500) {
    console.error("[user_service] request failed", error);
  }

  await writeAuditLog(req, inferAction(req), "failure", statusCode, message);

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.requestId,
    },
  });
}

function inferAction(req: Request): string {
  if (req.path.includes("/login")) return "AUTH_LOGIN";
  if (req.path.includes("/register")) return "AUTH_REGISTER";
  if (req.path.includes("/refresh")) return "AUTH_REFRESH";
  if (req.path.includes("/logout")) return "AUTH_LOGOUT";
  if (req.path.includes("/avatar")) return "USER_AVATAR_UPLOAD";
  if (req.path.includes("/media")) return "USER_MEDIA_REQUEST";
  if (req.path.includes("/me")) return "USER_PROFILE_REQUEST";
  if (req.path.includes("/role")) return "USER_ROLE_UPDATE";
  return "USER_SERVICE_REQUEST";
}
