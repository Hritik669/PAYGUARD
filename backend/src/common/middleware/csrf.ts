import { randomBytes } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../../config/env";
import { AppError } from "../errors";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function csrfCookieOptions() {
  const env = loadEnv();
  return {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

export function issueCsrfToken(res: Response, existing?: string): string {
  const token = existing && existing.length >= 32 ? existing : randomBytes(32).toString("hex");
  res.cookie("payguard_csrf", token, csrfCookieOptions());
  return token;
}

export function clearCsrfCookie(res: Response): void {
  const env = loadEnv();
  res.clearCookie("payguard_csrf", {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE.has(req.method)) {
    next();
    return;
  }
  if (req.path === "/api/v1/auth/login" || req.path === "/api/v1/webhooks/sandbox/events") {
    next();
    return;
  }
  const header = req.header("x-csrf-token");
  const cookie = req.cookies?.payguard_csrf as string | undefined;
  if (!header || !cookie || header !== cookie) {
    next(new AppError(403, "CSRF_VALIDATION_FAILED", "A valid CSRF token is required for this request."));
    return;
  }
  next();
}
