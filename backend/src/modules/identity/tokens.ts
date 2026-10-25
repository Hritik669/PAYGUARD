import { randomUUID } from "crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { loadEnv } from "../../config/env";
import { AppError } from "../../common/errors";

export type AccessClaims = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  jti: string;
  typ: "access";
};

export type RefreshClaims = {
  sub: string;
  sid: string;
  typ: "refresh";
};

function asObject(payload: string | JwtPayload): JwtPayload {
  if (typeof payload === "string") {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  return payload;
}

export function signAccessToken(
  user: { id: string; email: string; name: string; role: Role },
  jti = randomUUID(),
): { token: string; jti: string } {
  const env = loadEnv();
  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, jti, typ: "access" },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
  );
  return { token, jti };
}

export function signRefreshToken(userId: string, sessionId: string): string {
  const env = loadEnv();
  return jwt.sign({ sub: userId, sid: sessionId, typ: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = asObject(jwt.verify(token, loadEnv().JWT_ACCESS_SECRET));
    if (payload.typ !== "access" || typeof payload.sub !== "string" || typeof payload.role !== "string") {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    }
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role as Role,
      jti: String(payload.jti ?? ""),
      typ: "access",
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
}

export function verifyRefreshToken(token: string): RefreshClaims {
  try {
    const payload = asObject(jwt.verify(token, loadEnv().JWT_REFRESH_SECRET));
    if (payload.typ !== "refresh" || typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      throw new AppError(401, "UNAUTHENTICATED", "Refresh session is invalid.");
    }
    return { sub: payload.sub, sid: payload.sid, typ: "refresh" };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "UNAUTHENTICATED", "Refresh session is invalid.");
  }
}
