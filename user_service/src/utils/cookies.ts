import { parse, serialize, type SerializeOptions } from "cookie";
import type { Request, Response } from "express";

export const ACCESS_COOKIE = "ls_access_token";
export const REFRESH_COOKIE = "ls_refresh_token";
export const CSRF_COOKIE = "ls_refresh_csrf";

const isProduction = process.env.NODE_ENV === "production";

const baseCookieOptions: SerializeOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
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
      sameSite: "lax",
      secure: isProduction,
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
        sameSite: "lax",
        secure: isProduction,
      }),
    );
  }
}
