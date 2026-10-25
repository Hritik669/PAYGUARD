import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors";
import { logger } from "../../infrastructure/logger";
import { getRedis } from "../../infrastructure/redis";
import { asyncHandler } from "../../common/async-handler";
import { verifyAccessToken } from "../../modules/identity/tokens";

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.payguard_access as string | undefined;
  if (!token) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  const claims = verifyAccessToken(token);
  if (!claims.jti) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  try {
    const denied = await getRedis().get(`denylist:access:${claims.jti}`);
    if (denied) {
      throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn({ err: error }, "access token denylist unavailable; continuing with token expiry");
  }
  if (claims.role !== "ADMIN" && claims.role !== "ANALYST") {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  req.user = {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role,
  };
  next();
});
