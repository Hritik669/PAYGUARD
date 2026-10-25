import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../../infrastructure/prisma";

type Writer = Prisma.TransactionClient | PrismaClient;

export async function ensureWebhookQueued(
  writer: Writer,
  input: {
    providerEventId: string;
    eventType: string;
    paymentId: string | null;
    payload: Record<string, unknown>;
    availableAt?: Date;
  },
) {
  const existing = await writer.webhookEvent.findUnique({
    where: { providerEventId: input.providerEventId },
  });
  if (existing) return { event: existing, duplicate: true };

  const event = await writer.webhookEvent.create({
    data: {
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      paymentId: input.paymentId,
      payload: input.payload as Prisma.InputJsonValue,
      status: "RECEIVED",
      nextAttemptAt: input.availableAt ?? new Date(),
    },
  });
  await writer.outboxMessage.create({
    data: {
      webhookEventId: event.id,
      type: input.eventType,
      payload: input.payload as Prisma.InputJsonValue,
      availableAt: input.availableAt ?? new Date(),
    },
  });
  return { event, duplicate: false };
}

export async function listUnpublishedOutbox(limit = 25) {
  return getPrisma().outboxMessage.findMany({
    where: { publishedAt: null, availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
