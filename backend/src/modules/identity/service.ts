import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import { loadEnv } from "../../config/env";
import { AppError } from "../../common/errors";
import { sha256 } from "../../common/hash";
import { getPrisma } from "../../infrastructure/prisma";
import { logger } from "../../infrastructure/logger";
import { getRedis } from "../../infrastructure/redis";
import { isUniqueViolation } from "../../common/prisma-errors";
import { findUserByEmail, findUserById } from "../users/repository";
import { writeAudit } from "../audit/service";
import { permissionsFor } from "./permissions";
import { clearAuthCookies, setAuthCookies } from "./cookies";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "./tokens";
import type { LoginBody, RegisterBody } from "./validators";

const DUMMY_PASSWORD = "not-a-real-user-password";
let dummyHash: string | null = null;

async function getDummyHash(): Promise<string> {
  if (!dummyHash) {
    dummyHash = await bcrypt.hash(DUMMY_PASSWORD, loadEnv().BCRYPT_ROUNDS);
  }
  return dummyHash;
}

function publicUser(user: { id: string; email: string; name: string; role: "ADMIN" | "ANALYST" }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: permissionsFor(user.role),
  };
}

async function issueSession(
  user: { id: string; email: string; name: string; role: "ADMIN" | "ANALYST" },
  res: Response,
) {
  const env = loadEnv();
  const prisma = getPrisma();
  const session = await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: `pending_${randomUUID()}`,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  const refreshToken = signRefreshToken(user.id, session.id);
  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { tokenHash: sha256(refreshToken) },
  });
  const access = signAccessToken(user);
  const csrfToken = randomBytes(32).toString("hex");
  setAuthCookies(res, { accessToken: access.token, refreshToken, csrfToken });
  return { user: publicUser(user), csrfToken };
}

export async function register(input: RegisterBody, res: Response, requestId: string) {
  const passwordHash = await bcrypt.hash(input.password, loadEnv().BCRYPT_ROUNDS);
  const prisma = getPrisma();
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "ANALYST",
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists.");
    }
    throw error;
  }

  await writeAudit(prisma, {
    actorId: user.id,
    action: "auth.register",
    resourceType: "user",
    resourceId: user.id,
    requestId,
    metadata: { role: user.role },
  });
  return issueSession(user, res);
}

export async function login(input: LoginBody, res: Response, requestId: string) {
  const user = await findUserByEmail(input.email);
  const hash = user?.passwordHash ?? (await getDummyHash());
  const matches = await bcrypt.compare(input.password, hash);
  if (!user || !matches) {
    await getPrisma().auditLog.create({
      data: {
        action: "auth.login_failed",
        resourceType: "user",
        metadata: { email: input.email },
        requestId,
      },
    });
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const session = await issueSession(user, res);
  await writeAudit(getPrisma(), {
    actorId: user.id,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    requestId,
  });
  return session;
}

export async function logout(input: { refreshToken?: string; accessToken?: string }, res: Response, requestId: string) {
  const prisma = getPrisma();
  if (input.refreshToken) {
    try {
      const claims = verifyRefreshToken(input.refreshToken);
      const tokenHash = sha256(input.refreshToken);
      const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
      if (session && session.userId === claims.sub && !session.revokedAt) {
        await prisma.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        await writeAudit(prisma, {
          actorId: session.userId,
          action: "auth.logout",
          resourceType: "user",
          resourceId: session.userId,
          requestId,
        });
      }
    } catch (error) {
      logger.info({ err: error, requestId }, "logout ignored invalid refresh token");
    }
  }

  if (input.accessToken) {
    try {
      const access = verifyAccessToken(input.accessToken);
      if (access.jti) {
        await getRedis().set(`denylist:access:${access.jti}`, "1", "EX", loadEnv().ACCESS_TOKEN_TTL_SECONDS);
      }
    } catch (error) {
      logger.warn({ err: error }, "access token denylist skipped during logout");
    }
  }

  clearAuthCookies(res);
}

export async function refresh(refreshToken: string | undefined, res: Response) {
  if (!refreshToken) {
    throw new AppError(401, "UNAUTHENTICATED", "Refresh session is invalid.");
  }
  const claims = verifyRefreshToken(refreshToken);
  const tokenHash = sha256(refreshToken);
  const prisma = getPrisma();
  const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
  if (!session || session.userId !== claims.sub || session.id !== claims.sid) {
    throw new AppError(401, "UNAUTHENTICATED", "Refresh session is invalid.");
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "UNAUTHENTICATED", "Refresh session has expired.");
  }

  const user = await findUserById(session.userId);
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "Refresh session is invalid.");
  }

  const reused = await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      await tx.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    }
    return false;
  });
  if (reused) {
    clearAuthCookies(res);
    throw new AppError(401, "REFRESH_REUSE", "This refresh session is no longer valid.");
  }

  return issueSession(user, res);
}

export async function currentUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  return publicUser(user);
}
