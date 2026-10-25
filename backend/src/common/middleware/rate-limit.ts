import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../../config/env";
import { AppError } from "../errors";
import { logger } from "../../infrastructure/logger";
import { getRedis } from "../../infrastructure/redis";
import { asyncHandler } from "../async-handler";

export function rateLimit(options: {
  name: string;
  limit: number;
  windowSeconds: number;
  key: (req: Request) => string;
}) {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const redis = getRedis();
    const bucket = `rl:${loadEnv().NODE_ENV}:${options.name}:${options.key(req)}`;
    let count = 0;
    try {
      count = await redis.incr(bucket);
      if (count === 1) {
        await redis.expire(bucket, options.windowSeconds);
      }
    } catch (err) {
      logger.error({ err, bucket: options.name }, "rate limiter unavailable");
      throw new AppError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "Request rate limiting is temporarily unavailable. Try again shortly.",
      );
    }
    res.setHeader("RateLimit-Limit", String(options.limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.limit - count)));
    if (count > options.limit) {
      const ttl = await redis.ttl(bucket).catch(() => options.windowSeconds);
      res.setHeader("Retry-After", String(ttl));
      throw new AppError(429, "RATE_LIMITED", "Too many requests. Try again later.");
    }
    next();
  });
}
