import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";

type AuditResult = "success" | "failure";

export async function writeAuditLog(
  req: Request,
  action: string,
  result: AuditResult,
  statusCode: number,
  detail?: string,
): Promise<void> {
  try {
    await prisma.audit_log.create({
      data: {
        requestId: req.requestId ?? "unknown",
        userId: req.auth?.id,
        username: req.auth?.username,
        role: req.auth?.role,
        ipAddress: getClientIp(req),
        method: req.method,
        route: req.originalUrl || req.url,
        action,
        result,
        statusCode,
        detail: detail?.slice(0, 1024),
      },
    });
  } catch (error) {
    console.error("[audit] write failed", error);
  }
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  return req.ip || req.socket.remoteAddress || undefined;
}
