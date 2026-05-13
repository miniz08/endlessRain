import type { NextFunction, Request, Response } from "express";
import { getUserByAccessToken, type AuthUser } from "../src/services/authService.js";
import { getCookies, ACCESS_COOKIE } from "../src/utils/cookies.js";
import { HttpError } from "../src/utils/validation.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
      requestId?: string;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      throw new HttpError(401, "Authentication required", "AUTH_REQUIRED");
    }
    req.auth = await getUserByAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractAccessToken(req);
    if (token) {
      req.auth = await getUserByAccessToken(token);
    }
  } catch {
    req.auth = undefined;
  }
  next();
}

export function requireRole(...roles: string[]) {
  const allowed = new Set(roles.map((role) => role.toLowerCase()));
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new HttpError(401, "Authentication required", "AUTH_REQUIRED"));
      return;
    }
    if (!allowed.has(req.auth.role.toLowerCase())) {
      next(new HttpError(403, "Permission denied", "FORBIDDEN"));
      return;
    }
    next();
  };
}

function extractAccessToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return getCookies(req)[ACCESS_COOKIE];
}
