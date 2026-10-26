import type { MerchantDelivery, MerchantEndpoint } from "@prisma/client";
import { signSandboxPayload } from "../../common/hash";
import { getPrisma } from "../../infrastructure/prisma";
import { logger } from "../../infrastructure/logger";
import { isDeadLetter, nextRetryDelayMs } from "../webhooks/retry-policy";
import { assertEndpointUrl } from "./url-policy";

const TIMEOUT_MS = 5_000;

type DueDelivery = MerchantDelivery & { endpoint: MerchantEndpoint };

async function recordOutcome(
  delivery: DueDelivery,
  attemptNumber: number,
  outcome: { status: "DELIVERED" | "FAILED" | "DEAD_LETTER"; responseCode: number | null; durationMs: number; error: string | null },
): Promise<void> {
  const terminal = outcome.status === "DELIVERED" || outcome.status === "DEAD_LETTER";
  await getPrisma().$transaction(async (tx) => {
    await tx.merchantDeliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNumber,
        status: outcome.status === "DELIVERED" ? "DELIVERED" : "FAILED",
        responseCode: outcome.responseCode,
        durationMs: outcome.durationMs,
        errorSummary: outcome.error,
      },
    });
    await tx.merchantDelivery.update({
      where: { id: delivery.id },
      data: {
        status: outcome.status,
        attempts: attemptNumber,
        lastError: outcome.error,
        deliveredAt: outcome.status === "DELIVERED" ? new Date() : null,
        nextAttemptAt: terminal ? null : new Date(Date.now() + nextRetryDelayMs(attemptNumber)),
      },
    });
  });
}

async function deliverOne(delivery: DueDelivery): Promise<void> {
  const claimed = await getPrisma().merchantDelivery.updateMany({
    where: { id: delivery.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PROCESSING" },
  });
  if (claimed.count !== 1) return;
  const attemptNumber = delivery.attempts + 1;
  const started = Date.now();
  try {
    if (delivery.endpoint.status !== "ACTIVE") {
      await recordOutcome(delivery, attemptNumber, {
        status: "DEAD_LETTER",
        responseCode: null,
        durationMs: Date.now() - started,
        error: "The merchant endpoint is disabled.",
      });
      return;
    }
    const url = assertEndpointUrl(delivery.endpoint.url);
    const body = JSON.stringify(delivery.payload);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payguard-signature": signSandboxPayload(delivery.endpoint.signingSecret, body),
        "x-payguard-endpoint": delivery.endpoint.id,
        "x-payguard-event": delivery.eventType,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    const durationMs = Date.now() - started;
    if (response.status >= 200 && response.status < 300) {
      await recordOutcome(delivery, attemptNumber, { status: "DELIVERED", responseCode: response.status, durationMs, error: null });
      return;
    }
    const failed = isDeadLetter(attemptNumber);
    await recordOutcome(delivery, attemptNumber, {
      status: failed ? "DEAD_LETTER" : "FAILED",
      responseCode: response.status,
      durationMs,
      error: `Merchant responded ${response.status}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery failed.";
    logger.error({ err: error, deliveryId: delivery.id }, "merchant webhook delivery failed");
    await recordOutcome(delivery, attemptNumber, {
      status: isDeadLetter(attemptNumber) ? "DEAD_LETTER" : "FAILED",
      responseCode: null,
      durationMs: Date.now() - started,
      error: message.slice(0, 300),
    });
  }
}

export async function dispatchMerchantBatch(): Promise<number> {
  const due = await getPrisma().merchantDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    include: { endpoint: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  for (const delivery of due) {
    await deliverOne(delivery);
  }
  return due.length;
}

export async function recoverStuckMerchantDeliveries(): Promise<void> {
  const cutoff = new Date(Date.now() - 60_000);
  await getPrisma().merchantDelivery.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: cutoff } },
    data: { status: "FAILED", lastError: "Delivery was interrupted and will be retried.", nextAttemptAt: new Date() },
  });
}
