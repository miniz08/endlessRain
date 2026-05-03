import crypto from "node:crypto";
import { createServer } from "node:http";
import cors from "cors";
import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./lib/prisma.js";
import { optionalAuth, requireAuth } from "./middlewares/auth.js";
import {
  createThread,
  listMyThreads,
  listThreadMessages,
  sendThreadMessage,
} from "./controllers/chatController.js";
import { writeAuditLog } from "./services/auditService.js";
import { HttpError } from "./utils/validation.js";
import { installChatWebSocket } from "./ws/server.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3005);

app.disable("x-powered-by");
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "512kb" }));
app.use(assignRequestId);
app.use(optionalAuth);

app.get(["/health", "/chat/health"], async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({
    service: "chat_service",
    status: "ok",
    websocketPath: "/chat/ws",
    time: new Date().toISOString(),
  });
});

app.get("/chat/threads", requireAuth, wrap(listMyThreads));
app.post("/chat/threads", requireAuth, wrap(createThread));
app.get("/chat/threads/:threadId/messages", requireAuth, wrap(listThreadMessages));
app.post("/chat/threads/:threadId/messages", requireAuth, wrap(sendThreadMessage));

app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found", "NOT_FOUND"));
});

app.use(errorHandler);

const server = createServer(app);
app.locals.chatHub = installChatWebSocket(server);

server.listen(port, () => {
  console.log(`[chat_service] listening on ${port}`);
});

function assignRequestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  req.requestId = typeof incoming === "string" && incoming.trim() ? incoming : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}

function wrap(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

async function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): Promise<void> {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const code = error instanceof HttpError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof Error ? error.message : "Internal server error";

  if (statusCode >= 500) {
    console.error("[chat_service] request failed", error);
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
  if (req.path.includes("/threads") && req.path.includes("/messages")) return "CHAT_MESSAGE_REQUEST";
  if (req.path.includes("/threads")) return "CHAT_THREAD_REQUEST";
  return "CHAT_SERVICE_REQUEST";
}
