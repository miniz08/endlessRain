import type { Request, Response } from "express";
import {
  loginUser,
  refreshTokens,
  registerUser,
  revokeRefreshToken,
} from "../services/authService.js";
import { getPublicUserById } from "../services/userService.js";
import { writeAuditLog } from "../services/auditService.js";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  getCookies,
  setAccessCookie,
  setRefreshCookies,
} from "../utils/cookies.js";
import {
  assertEmail,
  assertPassword,
  assertString,
  assertUsername,
  normalizeRole,
  optionalString,
} from "../utils/validation.js";

export async function register(req: Request, res: Response): Promise<void> {
  const username = assertUsername(req.body?.username);
  const email = assertEmail(req.body?.email);
  const password = assertPassword(req.body?.password);
  const avatar = optionalString(req.body?.avatar);
  const role = normalizeRole(req.body?.role) ?? "user";

  const result = await registerUser({ username, email, password, avatar, role });
  attachAuthCookies(res, result.tokens);
  await writeAuditLog(req, "AUTH_REGISTER", "success", 201, `registered user ${result.user.id}`);
  res.status(201).json({
    user: result.user,
    csrfToken: result.tokens.csrfToken,
    accessTokenExpiresIn: result.tokens.accessTokenExpiresIn,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const identifier = assertString(req.body?.identifier ?? req.body?.email ?? req.body?.username, "identifier");
  const password = assertPassword(req.body?.password);

  const result = await loginUser(identifier, password, requestContext(req));
  req.auth = {
    id: result.user.id,
    username: result.user.username,
    email: result.user.email,
    role: result.user.role,
  };
  attachAuthCookies(res, result.tokens);
  await writeAuditLog(req, "AUTH_LOGIN", "success", 200, `login user ${result.user.id}`);
  res.json({
    user: result.user,
    csrfToken: result.tokens.csrfToken,
    accessTokenExpiresIn: result.tokens.accessTokenExpiresIn,
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const cookies = getCookies(req);
  const refreshToken = cookies[REFRESH_COOKIE] ?? assertString(req.body?.refreshToken, "refreshToken");
  const csrfToken =
    req.headers["x-csrf-token"]?.toString() ??
    req.body?.csrfToken ??
    cookies[CSRF_COOKIE];

  const result = await refreshTokens(refreshToken, assertString(csrfToken, "csrfToken"), requestContext(req));
  req.auth = {
    id: result.user.id,
    username: result.user.username,
    email: result.user.email,
    role: result.user.role,
  };
  attachAuthCookies(res, result.tokens);
  await writeAuditLog(req, "AUTH_REFRESH", "success", 200, `refresh user ${result.user.id}`);
  res.json({
    user: result.user,
    csrfToken: result.tokens.csrfToken,
    accessTokenExpiresIn: result.tokens.accessTokenExpiresIn,
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const refreshToken = getCookies(req)[REFRESH_COOKIE] ?? req.body?.refreshToken;
  await revokeRefreshToken(typeof refreshToken === "string" ? refreshToken : undefined);
  clearAuthCookies(res);
  await writeAuditLog(req, "AUTH_LOGOUT", "success", 200, "logout");
  res.json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await getPublicUserById(req.auth!.id);
  res.json({ user });
}

function attachAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string; csrfToken: string; accessTokenExpiresIn: number; refreshTokenExpiresIn: number }): void {
  setAccessCookie(res, tokens.accessToken, tokens.accessTokenExpiresIn);
  setRefreshCookies(res, tokens.refreshToken, tokens.csrfToken, tokens.refreshTokenExpiresIn);
}

function requestContext(req: Request) {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip || req.socket.remoteAddress,
  };
}
