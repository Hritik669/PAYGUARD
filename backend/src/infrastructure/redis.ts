import Redis from "ioredis";
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

export function getRedis(): Redis {
  if (!shared) {
    shared = attachLogging(
      new Redis(loadEnv().REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        connectTimeout: 5_000,
      }),
      "shared",
    );
  }
  return shared;
}

export function createBullConnection(): Redis {
  const connection = attachLogging(
    new Redis(loadEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    }),
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
