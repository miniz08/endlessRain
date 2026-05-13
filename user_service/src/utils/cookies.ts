import { parse, serialize, type SerializeOptions } from "cookie";
import type { Request, Response } from "express";

export const ACCESS_COOKIE = "ls_access_token";
export const REFRESH_COOKIE = "ls_refresh_token";
export const CSRF_COOKIE = "ls_refresh_csrf";

const cookieSecure = parseBooleanEnv(process.env.COOKIE_SECURE, false);
const cookieSameSite = parseSameSiteEnv(process.env.COOKIE_SAMESITE);

const baseCookieOptions: SerializeOptions = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  path: "/",
};

export function getCookies(req: Request): Record<string, string | undefined> {
  return parse(req.headers.cookie ?? "");
}

export function setAccessCookie(res: Response, token: string, maxAgeSeconds: number): void {
  res.append(
    "Set-Cookie",
    serialize(ACCESS_COOKIE, token, {
      ...baseCookieOptions,
      maxAge: maxAgeSeconds,
    }),
  );
}

export function setRefreshCookies(
  res: Response,
  refreshToken: string,
  csrfToken: string,
  maxAgeSeconds: number,
): void {
  res.append(
    "Set-Cookie",
    serialize(REFRESH_COOKIE, refreshToken, {
      ...baseCookieOptions,
      maxAge: maxAgeSeconds,
    }),
  );
  res.append(
    "Set-Cookie",
    serialize(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      sameSite: cookieSameSite,
      secure: cookieSecure,
      path: "/",
      maxAge: maxAgeSeconds,
    }),
  );
}

export function clearAuthCookies(res: Response): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    res.append(
      "Set-Cookie",
      serialize(name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: name !== CSRF_COOKIE,
        sameSite: cookieSameSite,
        secure: cookieSecure,
      }),
    );
  }
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseSameSiteEnv(value: string | undefined): SerializeOptions["sameSite"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "strict" || normalized === "none") return normalized;
  return "lax";
}
