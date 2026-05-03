import type { Request } from "express";
import { prisma } from "../lib/prisma.js";
import type { AuthUser } from "../middlewares/auth.js";

export type AuditResult = "success" | "failure";

export type AuditEvent = {
  requestId?: string;
  user?: AuthUser;
  ipAddress?: string;
  method: string;
  route: string;
  action: string;
  result: AuditResult;
  statusCode: number;
  detail?: string;
};

export async function writeAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await prisma.audit_log.create({
      data: {
        requestId: event.requestId ?? "unknown",
        userId: event.user?.id,
        username: event.user?.username,
        role: event.user?.role,
        ipAddress: event.ipAddress,
        method: event.method.slice(0, 16),
        route: event.route.slice(0, 512),
        action: event.action.slice(0, 128),
        result: event.result,
        statusCode: event.statusCode,
        detail: event.detail?.slice(0, 1024),
      },
    });
  } catch (error) {
    console.error("[chat_service] audit log failed", error);
  }
}

export async function writeAuditLog(
  req: Request,
  action: string,
  result: AuditResult,
  statusCode: number,
  detail?: string,
): Promise<void> {
  await writeAuditEvent({
    requestId: req.requestId,
    user: req.auth,
    ipAddress: req.ip,
    method: req.method,
    route: req.originalUrl,
    action,
    result,
    statusCode,
    detail,
  });
}
