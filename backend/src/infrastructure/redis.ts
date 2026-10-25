import Redis, { type RedisOptions } from "ioredis";
import { loadEnv } from "../config/env";
import { logger } from "./logger";

let shared: Redis | null = null;
const bullConnections: Redis[] = [];

function attachLogging(client: Redis, name: string): Redis {
  client.on("error", (err) => {
    logger.error({ err, redis: name }, "redis connection error");
  });
  client.on("connect", () => {
    logger.info({ redis: name }, "redis connected");
  });
  return client;
}

function redisOptions(url: string, overrides: RedisOptions): RedisOptions {
  return {
    connectTimeout: 10_000,
    enableReadyCheck: true,
    ...(url.startsWith("rediss://") ? { tls: { rejectUnauthorized: true } } : {}),
    ...overrides,
  };
}

export function getRedis(): Redis {
  if (!shared) {
    const url = loadEnv().REDIS_URL;
    shared = attachLogging(
      new Redis(
        url,
        redisOptions(url, {
          maxRetriesPerRequest: 2,
        }),
      ),
      "shared",
    );
  }
  return shared;
}

export function createBullConnection(): Redis {
  const url = loadEnv().REDIS_URL;
  const connection = attachLogging(
    new Redis(
      url,
      redisOptions(url, {
        maxRetriesPerRequest: null,
      }),
    ),
    "bullmq",
  );
  bullConnections.push(connection);
  return connection;
}

export async function disconnectRedis(): Promise<void> {
  const closers: Promise<unknown>[] = [];
  if (shared) {
    closers.push(shared.quit());
    shared = null;
  }
  for (const connection of bullConnections) {
    closers.push(connection.quit());
  }
  bullConnections.length = 0;
  await Promise.allSettled(closers);
}
