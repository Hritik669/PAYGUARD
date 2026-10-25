import type { Response } from "express";
import { loadEnv } from "../../config/env";

const accessCookie = "payguard_access";
const refreshCookie = "payguard_refresh";

function secure() {
  return loadEnv().COOKIE_SECURE;
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const env = loadEnv();
  res.cookie(accessCookie, tokens.accessToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/api",
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(refreshCookie, tokens.refreshToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie("payguard_csrf", tokens.csrfToken, {
    httpOnly: false,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const options = { secure: secure(), sameSite: "lax" as const };
  res.clearCookie(accessCookie, { ...options, httpOnly: true, path: "/api" });
  res.clearCookie(refreshCookie, { ...options, httpOnly: true, path: "/api/v1/auth" });
  res.clearCookie("payguard_csrf", { ...options, httpOnly: false, path: "/" });
}
