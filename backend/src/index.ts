import { loadEnv } from "./config/env";
import { createApp } from "./app";
import { logger } from "./infrastructure/logger";
import { closeQueues } from "./infrastructure/queue";
import { disconnectPrisma, getPrisma } from "./infrastructure/prisma";
import { disconnectRedis } from "./infrastructure/redis";
import { sleep } from "./common/sleep";

async function waitFor(label: string, probe: () => Promise<void>): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await probe();
      logger.info({ label }, "dependency is ready");
      return;
    } catch (err) {
      logger.warn({ err, label, attempt }, "dependency is not ready");
      await sleep(Math.min(attempt, 5) * 500);
    }
  }
  throw new Error(`${label} did not become ready.`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  await waitFor("postgres", async () => {
    await getPrisma().$queryRaw`SELECT 1`;
  });
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "PayGuard API listening");
  });
  server.requestTimeout = 30_000;

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down API");
    server.close();
    await closeQueues().catch((err) => logger.warn({ err }, "queue close failed"));
    await disconnectRedis().catch((err) => logger.warn({ err }, "redis close failed"));
    await disconnectPrisma().catch((err) => logger.warn({ err }, "prisma close failed"));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "API failed to start");
  process.exit(1);
});
