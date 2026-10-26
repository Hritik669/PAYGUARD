import { randomBytes } from "crypto";
import { getPrisma } from "../../infrastructure/prisma";
import { getWebhookQueue } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { listUnpublishedOutbox } from "../webhooks/outbox";
import { dispatchMerchantBatch, recoverStuckMerchantDeliveries } from "../merchant-webhooks/dispatcher";
import { recoverStuckWebhooks } from "../webhooks/processor";

export async function publishOutboxBatch(): Promise<number> {
  const rows = await listUnpublishedOutbox(25);
  if (rows.length === 0) return 0;
  const queue = getWebhookQueue();
  let published = 0;
  for (const row of rows) {
    await queue.add(
      "process-webhook",
      { eventId: row.webhookEventId },
      { jobId: `wh_${row.webhookEventId}_${Date.now()}_${randomBytes(3).toString("hex")}` },
    );
    await getPrisma().outboxMessage.update({
      where: { id: row.id },
      data: { publishedAt: new Date() },
    });
    published += 1;
  }
  return published;
}

export async function recoverPendingWork(): Promise<void> {
  await recoverStuckWebhooks();
  await recoverStuckMerchantDeliveries();
}

export async function dispatchMerchantWork(): Promise<number> {
  return dispatchMerchantBatch();
}

export async function beat(): Promise<void> {
  await getPrisma().workerHeartbeat.upsert({
    where: { id: "webhook-worker" },
    create: { id: "webhook-worker", lastSeenAt: new Date(), metadata: { pid: process.pid } },
    update: { lastSeenAt: new Date(), metadata: { pid: process.pid } },
  });
}

export function logWorkerLoopError(scope: string, err: unknown): void {
  logger.error({ err, scope }, "worker loop error");
}
