import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";

export async function writeAuditLog(
  req: Request,
  action: string,
  result: "success" | "failure",
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
        ipAddress: req.ip,
        method: req.method,
        route: req.originalUrl.slice(0, 512),
        action,
        result,
        statusCode,
        detail: detail?.slice(0, 1024),
      },
    });
  } catch (error) {
    console.error("[blog_service] audit log failed", error);
  }
}
