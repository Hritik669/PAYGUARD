import { getPrisma } from "../../infrastructure/prisma";
import { getRedis } from "../../infrastructure/redis";
import { getWebhookQueue } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";

const startedAt = Date.now();

async function databaseStatus(): Promise<"up" | "down"> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return "up";
  } catch (err) {
    logger.error({ err }, "database health check failed");
    return "down";
  }
}

async function redisStatus(): Promise<"up" | "down"> {
  try {
    const pong = await getRedis().ping();
    return pong === "PONG" ? "up" : "down";
  } catch (err) {
    logger.error({ err }, "redis health check failed");
    return "down";
  }
}

export async function readiness() {
  const [database, redis] = await Promise.all([databaseStatus(), redisStatus()]);
  return {
    status: database === "up" && redis === "up" ? "ready" : "not_ready",
    database,
    redis,
  };
}

export async function healthDetails() {
  const ready = await readiness();
  let worker: { status: "up" | "stale" | "down"; lastSeenAt: string | null } = {
    status: "down",
    lastSeenAt: null,
  };
  let queue: { waiting: number; active: number; failed: number; delayed: number; completed: number } | null = null;
  try {
    const beat = await getPrisma().workerHeartbeat.findUnique({ where: { id: "webhook-worker" } });
    if (beat) {
      const age = Date.now() - beat.lastSeenAt.getTime();
      worker = {
        status: age < 30_000 ? "up" : "stale",
        lastSeenAt: beat.lastSeenAt.toISOString(),
      };
    }
  } catch (err) {
    logger.warn({ err }, "worker heartbeat unavailable");
  }
  if (ready.redis === "up") {
    try {
      const counts = await getWebhookQueue().getJobCounts("waiting", "active", "failed", "delayed", "completed");
      queue = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
      };
    } catch (err) {
      logger.warn({ err }, "queue depth unavailable");
    }
  }
  return {
    service: "payguard-api",
    environment: process.env.NODE_ENV,
    sandbox: true,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    ...ready,
    worker,
    queue,
  };
}
