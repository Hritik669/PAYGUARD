import { Prisma } from "@prisma/client";
import { TransientWebhookError } from "../../common/errors";
import { getPrisma } from "../../infrastructure/prisma";
import { logger } from "../../infrastructure/logger";
import { incrementCacheVersion } from "../../infrastructure/cache";
import { writeAudit } from "../audit/service";
import { canTransition } from "../payments/state-machine";
import { recordLedgerEntry, transitionPayment } from "../payments/repository";
import { isDeadLetter, nextRetryDelayMs } from "./retry-policy";

class PermanentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentWebhookError";
  }
}

function readFailTimes(payload: Prisma.JsonValue): number {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 0;
  const data = (payload as { data?: { failTimes?: unknown } }).data;
  return typeof data?.failTimes === "number" ? data.failTimes : 0;
}

function targetFor(eventType: string): "SUCCEEDED" | "FAILED" | null {
  if (eventType === "payment.succeeded") return "SUCCEEDED";
  if (eventType === "payment.failed") return "FAILED";
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Webhook processing failed.";
}

export async function processWebhookEvent(eventId: string): Promise<void> {
  const prisma = getPrisma();
  const claimed = await prisma.webhookEvent.updateMany({
    where: { id: eventId, status: { in: ["RECEIVED", "FAILED"] } },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return;

  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event) return;
  const started = Date.now();
  const deliveryCount = await prisma.webhookDelivery.count({ where: { webhookEventId: event.id } });
  const attemptNumber = deliveryCount + 1;

  try {
    if (readFailTimes(event.payload) >= attemptNumber) {
      throw new TransientWebhookError("Simulated transient webhook processing failure.");
    }
    await applyEvent(event, attemptNumber, Date.now() - started);
    await incrementCacheVersion("dashboard");
  } catch (error) {
    await recordFailure(event.id, event.attempts, attemptNumber, started, error);
    logger.error({ err: error, eventId, attemptNumber }, "webhook processing failed");
  }
}

async function applyEvent(
  event: { id: string; eventType: string; paymentId: string | null; attempts: number },
  attemptNumber: number,
  durationMs: number,
): Promise<void> {
  const target = targetFor(event.eventType);
  if (!target) throw new PermanentWebhookError(`Unsupported webhook type ${event.eventType}.`);
  if (!event.paymentId) throw new PermanentWebhookError("Webhook event is not linked to a payment.");

  await getPrisma().$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: event.paymentId! } });
    if (!payment) throw new PermanentWebhookError("Payment referenced by the webhook no longer exists.");

    let note: string | null = null;
    if (payment.status === target) {
      note = "Duplicate event ignored because the payment was already in the target state.";
    } else if (canTransition(payment.status, target)) {
      const next = await transitionPayment(tx, {
        payment,
        to: target,
        reason: `Applied sandbox webhook ${event.eventType}.`,
        actorId: null,
        action: "payment.webhook_applied",
      });
      await recordLedgerEntry(tx, next, target === "SUCCEEDED" ? "succeeded" : "failed");
    } else {
      note = `Conflicting webhook ${event.eventType} was stored without changing ${payment.status}.`;
      await writeAudit(tx, {
        action: "webhook.conflict",
        resourceType: "payment",
        resourceId: payment.id,
        metadata: { eventId: event.id, eventType: event.eventType, status: payment.status },
      });
    }

    await tx.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        attempts: 0,
        lastError: note,
        nextAttemptAt: null,
      },
    });
    await tx.webhookDelivery.create({
      data: {
        webhookEventId: event.id,
        attemptNumber,
        status: note && note.startsWith("Conflicting") ? "FAILED" : "SUCCEEDED",
        responseCode: note && note.startsWith("Conflicting") ? 409 : 200,
        durationMs,
        errorSummary: note,
      },
    });
  });
}

async function recordFailure(
  eventId: string,
  previousAttempts: number,
  attemptNumber: number,
  started: number,
  error: unknown,
): Promise<void> {
  const message = errorMessage(error).slice(0, 500);
  const permanent = error instanceof PermanentWebhookError;
  const consecutive = previousAttempts + 1;
  const terminal = permanent || isDeadLetter(consecutive);
  const delay = nextRetryDelayMs(consecutive);
  const nextAttemptAt = terminal ? null : new Date(Date.now() + delay);
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: terminal ? "DEAD_LETTER" : "FAILED",
        attempts: consecutive,
        lastError: message,
        nextAttemptAt,
      },
    });
    await tx.webhookDelivery.create({
      data: {
        webhookEventId: eventId,
        attemptNumber,
        status: terminal ? "FAILED" : "RETRY_SCHEDULED",
        responseCode: 500,
        durationMs: Date.now() - started,
        errorSummary: message,
        nextAttemptAt,
      },
    });
    if (!terminal) {
      await tx.outboxMessage.update({
        where: { webhookEventId: eventId },
        data: { publishedAt: null, availableAt: nextAttemptAt ?? new Date() },
      });
    }
  });
}

export async function recoverStuckWebhooks(): Promise<void> {
  const cutoff = new Date(Date.now() - 60_000);
  const prisma = getPrisma();
  const stuck = await prisma.webhookEvent.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const event of stuck) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", lastError: "Recovered after the worker stopped mid-processing." },
    });
    await prisma.outboxMessage.updateMany({
      where: { webhookEventId: event.id },
      data: { publishedAt: null, availableAt: new Date() },
    });
    logger.warn({ eventId: event.id }, "recovered stuck webhook event");
  }
}
