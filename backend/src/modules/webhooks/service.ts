import type { Prisma } from "@prisma/client";
import { loadEnv } from "../../config/env";
import { AppError } from "../../common/errors";
import { verifySandboxSignature } from "../../common/hash";
import { isUniqueViolation } from "../../common/prisma-errors";
import { getPrisma } from "../../infrastructure/prisma";
import { writeAudit } from "../audit/service";
import { ensureWebhookQueued } from "./outbox";
import type { SandboxEvent, WebhookListQuery } from "./validators";

function presentEvent(event: {
  id: string;
  providerEventId: string;
  eventType: string;
  paymentId: string | null;
  payload: Prisma.JsonValue;
  status: string;
  attempts: number;
  nextAttemptAt: Date | null;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  deliveries?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    responseCode: number | null;
    durationMs: number | null;
    errorSummary: string | null;
    attemptedAt: Date;
    nextAttemptAt: Date | null;
  }>;
  payment?: { merchantReference: string; status: string } | null;
}) {
  return {
    id: event.id,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    paymentId: event.paymentId,
    payload: event.payload,
    status: event.status,
    attempts: event.attempts,
    nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
    processedAt: event.processedAt?.toISOString() ?? null,
    lastError: event.lastError,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    payment: event.payment ?? null,
    deliveries: (event.deliveries ?? []).map((delivery) => ({
      ...delivery,
      attemptedAt: delivery.attemptedAt.toISOString(),
      nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    })),
  };
}

const include = {
  deliveries: { orderBy: { attemptNumber: "asc" as const } },
  payment: { select: { merchantReference: true, status: true } },
};

export async function ingestSandboxEvent(rawBody: string, signature: string | undefined, event: SandboxEvent) {
  if (!verifySandboxSignature(loadEnv().WEBHOOK_SANDBOX_SECRET, rawBody, signature)) {
    throw new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Sandbox webhook signature is invalid.");
  }
  const prisma = getPrisma();
  let paymentId = event.data.paymentId ?? null;
  if (!paymentId && event.data.providerReference) {
    const payment = await prisma.payment.findUnique({
      where: { providerReference: event.data.providerReference },
      select: { id: true },
    });
    paymentId = payment?.id ?? null;
  }
  if (!paymentId && event.data.merchantReference) {
    const payment = await prisma.payment.findUnique({
      where: { merchantReference: event.data.merchantReference },
      select: { id: true },
    });
    paymentId = payment?.id ?? null;
  }

  try {
    const result = await prisma.$transaction((tx) =>
      ensureWebhookQueued(tx, {
        providerEventId: event.id,
        eventType: event.type,
        paymentId,
        payload: event,
      }),
    );
    return { duplicate: result.duplicate, eventId: result.event.id, status: result.event.status };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.webhookEvent.findUnique({ where: { providerEventId: event.id } });
    return { duplicate: true, eventId: existing?.id ?? null, status: existing?.status ?? "RECEIVED" };
  }
}

export async function listWebhookEvents(query: WebhookListQuery) {
  const where: Prisma.WebhookEventWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.q) {
    where.OR = [
      { providerEventId: { contains: query.q, mode: "insensitive" } },
      { eventType: { contains: query.q, mode: "insensitive" } },
      { payment: { merchantReference: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const prisma = getPrisma();
  const [total, rows] = await prisma.$transaction([
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, items: rows.map((row) => presentEvent(row)) };
}

export async function getWebhookEvent(id: string) {
  const event = await getPrisma().webhookEvent.findUnique({ where: { id }, include });
  if (!event) throw new AppError(404, "WEBHOOK_NOT_FOUND", "Webhook event not found.");
  return presentEvent(event);
}

export async function replayWebhookEvent(id: string, actorId: string, requestId: string) {
  const prisma = getPrisma();
  const event = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!event) throw new AppError(404, "WEBHOOK_NOT_FOUND", "Webhook event not found.");
  if (event.status !== "FAILED" && event.status !== "DEAD_LETTER") {
    throw new AppError(409, "WEBHOOK_NOT_REPLAYABLE", "Only failed or dead-letter events can be replayed.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.update({
      where: { id },
      data: { status: "RECEIVED", attempts: 0, lastError: null, nextAttemptAt: new Date() },
    });
    await tx.outboxMessage.update({
      where: { webhookEventId: id },
      data: { publishedAt: null, availableAt: new Date() },
    });
    await writeAudit(tx, {
      actorId,
      action: "webhook.replayed",
      resourceType: "webhook_event",
      resourceId: id,
      requestId,
      metadata: { providerEventId: event.providerEventId },
    });
  });
  return getWebhookEvent(id);
}
