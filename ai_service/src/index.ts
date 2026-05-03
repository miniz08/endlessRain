import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { optionalAuth } from "../middlewares/auth.js";
import { analysisRouter } from "./api/analysis.js";
import { writeAuditLog } from "./services/auditService.js";
import { tagCount } from "./services/tagTaxonomy.js";
import { HttpError } from "./utils/validation.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3004);

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
    service: "ai_service",
    status: "ok",
    provider: process.env.AI_PROVIDER ?? "mock",
    taxonomy: tagCount(),
    time: new Date().toISOString(),
  });
});

app.use("/analysis", analysisRouter);

app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found", "NOT_FOUND"));
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`[ai_service] listening on ${port}`);
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
    console.error("[ai_service] request failed", error);
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
  if (req.path.includes("/analysis/text")) return "AI_ANALYZE_TEXT";
  if (req.path.includes("/analysis/articles")) return "AI_ANALYZE_ARTICLE";
  return "AI_SERVICE_REQUEST";
}
