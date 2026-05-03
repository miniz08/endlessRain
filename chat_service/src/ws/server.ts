import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  extractAccessTokenFromHeaders,
  verifyAccessToken,
  type AuthUser,
} from "../middlewares/auth.js";
import { createMessage, type ChatMessageDto } from "../services/chatService.js";
import { writeAuditEvent } from "../services/auditService.js";
import { HttpError, positiveInt } from "../utils/validation.js";

type ClientMessage =
  | {
      type: "send_message";
      threadId: unknown;
      content?: unknown;
      emoji?: unknown;
      clientId?: unknown;
    }
  | {
      type: "ping";
    };

type AuthedWebSocket = WebSocket & {
  user?: AuthUser;
  isAlive?: boolean;
};

export type ChatRealtimeHub = {
  broadcastMessage(message: ChatMessageDto, participantIds: number[], clientId?: string): void;
};

const connections = new Map<number, Set<AuthedWebSocket>>();

export function installChatWebSocket(server: Server): ChatRealtimeHub {
  const wss = new WebSocketServer({ noServer: true });
  const hub: ChatRealtimeHub = {
    broadcastMessage(message, participantIds, clientId) {
      broadcast(participantIds, {
        type: "message_created",
        message,
        clientId,
      });
    },
  };

  server.on("upgrade", (request, socket, head) => {
    void handleUpgrade(wss, request, socket, head);
  });

  wss.on("connection", (socket: AuthedWebSocket, request: IncomingMessage, user: AuthUser) => {
    socket.user = user;
    socket.isAlive = true;
    addConnection(user.id, socket);

    send(socket, {
      type: "ready",
      userId: user.id,
    });

    void writeAuditEvent({
      requestId: readRequestId(request),
      user,
      ipAddress: socketAddress(request),
      method: "WS",
      route: request.url ?? "/chat/ws",
      action: "CHAT_WS_CONNECT",
      result: "success",
      statusCode: 101,
      detail: `user ${user.id}`,
    });

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (raw) => {
      void handleSocketMessage(socket, raw, hub);
    });

    socket.on("close", () => {
      removeConnection(user.id, socket);
    });
  });

  const heartbeat = setInterval(() => {
    for (const clients of connections.values()) {
      for (const socket of clients) {
        if (socket.isAlive === false) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        socket.ping();
      }
    }
  }, 30_000);
  heartbeat.unref?.();

  return hub;
}

async function handleUpgrade(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname !== "/chat/ws") {
    return;
  }

  try {
    const queryToken = url.searchParams.get("token") ?? undefined;
    const token = queryToken ?? extractAccessTokenFromHeaders(request.headers.authorization, request.headers.cookie);
    if (!token) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }

    const user = await verifyAccessToken(token);
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, user);
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    socket.write(
      `HTTP/1.1 ${statusCode} ${statusCode === 401 ? "Unauthorized" : "Internal Server Error"}\r\nConnection: close\r\n\r\n`,
    );
    socket.destroy();
  }
}

async function handleSocketMessage(socket: AuthedWebSocket, raw: WebSocket.RawData, hub: ChatRealtimeHub): Promise<void> {
  try {
    const message = parseClientMessage(raw);
    if (message.type === "ping") {
      send(socket, { type: "pong" });
      return;
    }

    const clientId = typeof message.clientId === "string" ? message.clientId.slice(0, 128) : undefined;
    const created = await createMessage({
      senderId: socket.user!.id,
      threadId: positiveInt(message.threadId, "threadId"),
      content: message.content,
      emoji: message.emoji,
    });
    hub.broadcastMessage(created.message, created.participantIds, clientId);
  } catch (error) {
    const code = error instanceof HttpError ? error.code : "CHAT_WS_ERROR";
    const message = error instanceof Error ? error.message : "WebSocket message failed";
    send(socket, {
      type: "error",
      code,
      message,
    });
  }
}

function parseClientMessage(raw: WebSocket.RawData): ClientMessage {
  const text = raw.toString("utf8");
  const parsed = JSON.parse(text) as ClientMessage;
  if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
    throw new HttpError(400, "Invalid WebSocket message", "WS_MESSAGE_INVALID");
  }

  if (parsed.type !== "send_message" && parsed.type !== "ping") {
    throw new HttpError(400, "Unsupported WebSocket message type", "WS_MESSAGE_UNSUPPORTED");
  }

  return parsed;
}

function addConnection(userId: number, socket: AuthedWebSocket): void {
  const clients = connections.get(userId) ?? new Set<AuthedWebSocket>();
  clients.add(socket);
  connections.set(userId, clients);
}

function removeConnection(userId: number, socket: AuthedWebSocket): void {
  const clients = connections.get(userId);
  if (!clients) return;
  clients.delete(socket);
  if (clients.size === 0) {
    connections.delete(userId);
  }
}

function broadcast(userIds: number[], payload: unknown): void {
  for (const userId of userIds) {
    const clients = connections.get(userId);
    if (!clients) continue;

    for (const socket of clients) {
      send(socket, payload);
    }
  }
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function readRequestId(request: IncomingMessage): string | undefined {
  const header = request.headers["x-request-id"];
  return typeof header === "string" ? header : undefined;
}

function socketAddress(request: IncomingMessage): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  return request.socket.remoteAddress;
}
