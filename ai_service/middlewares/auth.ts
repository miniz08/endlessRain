import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../src/utils/validation.js";

type JwtUser = {
  sub?: string;
  username?: string;
  email?: string;
  role?: string;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        id: number;
        username?: string;
        email?: string;
        role?: string;
      };
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractAccessToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "dev-access-token-secret") as JwtUser;
    const id = Number(payload.sub);
    if (Number.isInteger(id) && id > 0) {
      req.auth = {
        id,
        username: payload.username,
        email: payload.email,
        role: payload.role,
      };
    }
  } catch {
  }

  next();
}

export function requireAdminOrInternal(req: Request, _res: Response, next: NextFunction): void {
  if (isInternalRequest(req) || isAdminRole(req.auth?.role)) {
    next();
    return;
  }
  next(new HttpError(403, "Analysis APIs are restricted to admins or internal services", "FORBIDDEN"));
}

function extractAccessToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return parseCookie(req.headers.cookie ?? "")["ls_access_token"];
}

function isInternalRequest(req: Request): boolean {
  const expected = process.env.AI_INTERNAL_TOKEN ?? "dev-internal-service-token";
  const actual = req.headers["x-internal-service-token"];
  return typeof actual === "string" && actual.length > 0 && actual === expected;
}

function isAdminRole(role?: string): boolean {
  const normalized = role?.toLowerCase();
  return normalized === "admin";
}

function parseCookie(header: string): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}
