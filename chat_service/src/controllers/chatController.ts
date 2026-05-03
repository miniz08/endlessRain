import type { Request, Response } from "express";
import {
  createMessage,
  getOrCreateThread,
  listMessages,
  listThreads,
} from "../services/chatService.js";
import { writeAuditLog } from "../services/auditService.js";
import { parsePagination, positiveInt } from "../utils/validation.js";
import type { ChatRealtimeHub } from "../ws/server.js";

export async function listMyThreads(req: Request, res: Response): Promise<void> {
  const pagination = parsePagination(req.query as Record<string, unknown>);
  const result = await listThreads(req.auth!.id, pagination);
  await writeAuditLog(req, "CHAT_THREAD_LIST", "success", 200);
  res.json(result);
}

export async function createThread(req: Request, res: Response): Promise<void> {
  const peerId = positiveInt(req.body?.peerId, "peerId");
  const thread = await getOrCreateThread(req.auth!.id, peerId);
  await writeAuditLog(req, "CHAT_THREAD_CREATE", "success", 201, `thread ${thread.id}`);
  res.status(201).json({ item: thread });
}

export async function listThreadMessages(req: Request, res: Response): Promise<void> {
  const threadId = positiveInt(req.params.threadId, "threadId");
  const pagination = parsePagination(req.query as Record<string, unknown>, 50, 100);
  const result = await listMessages(req.auth!.id, threadId, pagination);
  await writeAuditLog(req, "CHAT_MESSAGE_LIST", "success", 200, `thread ${threadId}`);
  res.json(result);
}

export async function sendThreadMessage(req: Request, res: Response): Promise<void> {
  const threadId = positiveInt(req.params.threadId, "threadId");
  const result = await createMessage({
    senderId: req.auth!.id,
    threadId,
    content: req.body?.content,
    emoji: req.body?.emoji,
  });

  const hub = req.app.locals.chatHub as ChatRealtimeHub | undefined;
  hub?.broadcastMessage(result.message, result.participantIds);

  await writeAuditLog(req, "CHAT_MESSAGE_CREATE", "success", 201, `message ${result.message.id}`);
  res.status(201).json({ item: result.message });
}
