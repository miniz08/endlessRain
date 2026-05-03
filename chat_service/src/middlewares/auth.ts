import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/validation.js";

type JwtUser = {
  sub?: string;
  username?: string;
  email?: string;
  role?: string;
};

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  role: string;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthUser;
    }
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractAccessTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  try {
    req.auth = await verifyAccessToken(token);
  } catch {
    // Optional auth should not break health or public endpoints because of an expired cookie.
  }

  next();
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractAccessTokenFromRequest(req);
    if (!token) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    req.auth = await verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

export function extractAccessTokenFromRequest(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return extractAccessTokenFromHeaders(req.headers.authorization, req.headers.cookie);
}

export function extractAccessTokenFromHeaders(
  authorization?: string | string[],
  cookie?: string | string[],
): string | undefined {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  const cookieHeader = Array.isArray(cookie) ? cookie.join(";") : cookie;
  return parseCookie(cookieHeader ?? "")["ls_access_token"];
}

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  let payload: JwtUser;
  try {
    payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "dev-access-token-secret") as JwtUser;
  } catch {
    throw new HttpError(401, "Access token is invalid or expired", "ACCESS_TOKEN_INVALID");
  }

  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(401, "Access token subject is invalid", "ACCESS_TOKEN_INVALID");
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, role: true },
  });

  if (!user) {
    throw new HttpError(401, "User no longer exists", "USER_NOT_FOUND");
  }

  return user;
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
