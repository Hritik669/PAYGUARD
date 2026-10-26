import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { verifySandboxSignature } from "../../common/hash";
import { getPrisma } from "../../infrastructure/prisma";
import { writeAudit } from "../audit/service";
import { assertEndpointUrl } from "./url-policy";

const EVENTS = ["payment.succeeded", "payment.failed", "payment.refunded", "payment.voided", "payment.requires_reconciliation"] as const;

export function merchantEventTypes(): readonly string[] {
  return EVENTS;
}

function presentEndpoint(endpoint: {
  id: string;
  url: string;
  description: string;
  eventTypes: Prisma.JsonValue;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}, signingSecret?: string) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes,
    status: endpoint.status,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
    ...(signingSecret ? { signingSecret } : {}),
  };
}

export async function createEndpoint(input: { url: string; description: string; eventTypes: string[] }, actorId: string, requestId: string) {
  assertEndpointUrl(input.url);
  const unknown = input.eventTypes.filter((event) => !EVENTS.includes(event as (typeof EVENTS)[number]));
  if (unknown.length > 0) throw new AppError(400, "INVALID_EVENT_TYPE", "Choose events this sandbox can emit.");
  const signingSecret = randomBytes(32).toString("hex");
  const endpoint = await getPrisma().$transaction(async (tx) => {
    const created = await tx.merchantEndpoint.create({
      data: {
        url: input.url,
        description: input.description,
        signingSecret,
        eventTypes: input.eventTypes,
      },
    });
    await writeAudit(tx, {
      actorId,
      action: "merchant_endpoint.created",
      resourceType: "merchant_endpoint",
      resourceId: created.id,
      requestId,
      metadata: { url: input.url, eventTypes: input.eventTypes },
    });
    return created;
  });
  return presentEndpoint(endpoint, signingSecret);
}

export async function listEndpoints() {
  const rows = await getPrisma().merchantEndpoint.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((row) => presentEndpoint(row));
}

export async function listDeliveries(page: number, pageSize: number) {
  const where = {};
  const [total, rows] = await Promise.all([
    getPrisma().merchantDelivery.count({ where }),
    getPrisma().merchantDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        endpoint: { select: { id: true, description: true, url: true } },
        payment: { select: { merchantReference: true } },
        attemptsLog: { orderBy: { attemptNumber: "asc" } },
      },
    }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      endpoint: row.endpoint,
      paymentId: row.paymentId,
      merchantReference: row.payment?.merchantReference ?? null,
      attemptsLog: row.attemptsLog.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        responseCode: attempt.responseCode,
        durationMs: attempt.durationMs,
        errorSummary: attempt.errorSummary,
        attemptedAt: attempt.attemptedAt.toISOString(),
      })),
    })),
  };
}

export async function replayDelivery(id: string, actorId: string, requestId: string) {
  const delivery = await getPrisma().merchantDelivery.findUnique({ where: { id } });
  if (!delivery) throw new AppError(404, "DELIVERY_NOT_FOUND", "Merchant delivery not found.");
  if (delivery.status !== "FAILED" && delivery.status !== "DEAD_LETTER") {
    throw new AppError(409, "DELIVERY_NOT_REPLAYABLE", "Only a failed or dead-letter delivery can be replayed.");
  }
  await getPrisma().$transaction(async (tx) => {
    await tx.merchantDelivery.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    await writeAudit(tx, {
      actorId,
      action: "merchant_delivery.replayed",
      resourceType: "merchant_delivery",
      resourceId: id,
      requestId,
      metadata: { eventType: delivery.eventType },
    });
  });
  return { id, status: "PENDING" };
}

export async function acceptSink(input: { endpointId: string; rawBody: string; signature: string | undefined }) {
  const endpoint = await getPrisma().merchantEndpoint.findUnique({ where: { id: input.endpointId } });
  if (!endpoint || !verifySandboxSignature(endpoint.signingSecret, input.rawBody, input.signature)) {
    throw new AppError(401, "INVALID_SIGNATURE", "The merchant webhook signature is invalid.");
  }
  let payload: { type?: string; data?: { paymentId?: string } };
  try {
    payload = JSON.parse(input.rawBody) as { type?: string; data?: { paymentId?: string } };
  } catch {
    throw new AppError(400, "INVALID_PAYLOAD", "The merchant webhook body must be JSON.");
  }
  await getPrisma().merchantSinkReceipt.create({
    data: {
      endpointId: endpoint.id,
      eventType: typeof payload.type === "string" ? payload.type : "unknown",
      paymentId: payload.data?.paymentId ?? null,
      payload,
    },
  });
  return { accepted: true };
}

export async function listReceipts() {
  const rows = await getPrisma().merchantSinkReceipt.findMany({ orderBy: { receivedAt: "desc" }, take: 20 });
  return rows.map((row) => ({
    id: row.id,
    endpointId: row.endpointId,
    eventType: row.eventType,
    paymentId: row.paymentId,
    receivedAt: row.receivedAt.toISOString(),
  }));
}
