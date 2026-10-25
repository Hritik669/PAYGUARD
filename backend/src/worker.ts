import { Worker } from "bullmq";
import { loadEnv } from "./config/env";
import { sleep } from "./common/sleep";
import { logger } from "./infrastructure/logger";
import { WEBHOOK_QUEUE } from "./infrastructure/queue";
import { disconnectPrisma, getPrisma } from "./infrastructure/prisma";
import { createBullConnection, disconnectRedis } from "./infrastructure/redis";
import { beat, logWorkerLoopError, publishOutboxBatch, recoverPendingWork } from "./modules/jobs/worker-loop";
import { processWebhookEvent } from "./modules/webhooks/processor";

async function main(): Promise<void> {
  loadEnv();
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      break;
    } catch (err) {
      if (attempt === 30) throw err;
      logger.warn({ err, attempt }, "worker waiting for postgres");
      await sleep(1000);
    }
  }

  const connection = createBullConnection();
  const worker = new Worker(
    WEBHOOK_QUEUE,
    async (job) => {
      const eventId = job.data?.eventId;
      if (typeof eventId !== "string") return;
      await processWebhookEvent(eventId);
    },
    { connection, concurrency: 8 },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "webhook job failed");
  });

  const timer = setInterval(() => {
    void publishOutboxBatch().catch((err) => logWorkerLoopError("outbox", err));
    void recoverPendingWork().catch((err) => logWorkerLoopError("recovery", err));
    void beat().catch((err) => logWorkerLoopError("heartbeat", err));
  }, 2000);

  logger.info("PayGuard webhook worker started");

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "shutting down worker");
    clearInterval(timer);
    await worker.close();
    await connection.quit();
    await disconnectRedis();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
