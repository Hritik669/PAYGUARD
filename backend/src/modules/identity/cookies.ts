import type { CookieOptions, Response } from "express";
import { loadEnv } from "../../config/env";

const accessCookie = "payguard_access";
const refreshCookie = "payguard_refresh";

export function authCookiePolicy(): Pick<CookieOptions, "secure" | "sameSite" | "partitioned"> {
  const env = loadEnv();
  return {
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    ...(env.COOKIE_SAMESITE === "none" ? { partitioned: true } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const env = loadEnv();
  const policy = authCookiePolicy();
  res.cookie(accessCookie, tokens.accessToken, {
    ...policy,
    httpOnly: true,
    path: "/api",
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(refreshCookie, tokens.refreshToken, {
    ...policy,
    httpOnly: true,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie("payguard_csrf", tokens.csrfToken, {
    ...policy,
    httpOnly: false,
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const policy = authCookiePolicy();
  res.clearCookie(accessCookie, { ...policy, httpOnly: true, path: "/api" });
  res.clearCookie(refreshCookie, { ...policy, httpOnly: true, path: "/api/v1/auth" });
  res.clearCookie("payguard_csrf", { ...policy, httpOnly: false, path: "/" });
}
