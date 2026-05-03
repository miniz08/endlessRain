import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { optionalAuth } from "../middlewares/auth.js";
import { articleRouter } from "./api/article.js";
import { commentRouter } from "./api/comment.js";
import { feedRouter } from "./api/feed.js";
import { followRouter } from "./api/follow.js";
import { recoRouter } from "./api/reco.js";
import { writeAuditLog } from "./services/auditService.js";
import { REACTION_EMOJIS } from "./services/reactionConfig.js";
import { HttpError } from "./utils/validation.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3002);

app.disable("x-powered-by");
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(assignRequestId);
app.use(optionalAuth);

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    service: "blog_service",
    status: "ok",
    reactions: REACTION_EMOJIS,
    aiServiceConfigured: Boolean(process.env.AI_SERVICE_URL),
    time: new Date().toISOString(),
  });
});

app.use("/articles", articleRouter);
app.use(commentRouter);
app.use(followRouter);
app.use("/feeds", feedRouter);
app.use("/reco", recoRouter);

app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found", "NOT_FOUND"));
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`[blog_service] listening on ${port}`);
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
    console.error("[blog_service] request failed", error);
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
  if (req.path.includes("/reactions")) return "REACTION_REQUEST";
  if (req.path.includes("/follow")) return "FOLLOW_REQUEST";
  if (req.path.includes("/feeds")) return "FEED_REQUEST";
  if (req.path.includes("/reco")) return "RECO_REQUEST";
  if (req.path.includes("/comments")) return "COMMENT_REQUEST";
  if (req.path.includes("/articles")) return "ARTICLE_REQUEST";
  return "BLOG_SERVICE_REQUEST";
}
