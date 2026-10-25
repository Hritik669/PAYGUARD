import { createHash } from "crypto";
import { Prisma, type Payment, type PaymentStatus, type TransactionStatus, type TransactionType } from "@prisma/client";
import { AppError } from "../../common/errors";
import { isUniqueViolation, uniqueTargets } from "../../common/prisma-errors";
import { getPrisma } from "../../infrastructure/prisma";
import { writeAudit } from "../audit/service";
import { assertTransition } from "./state-machine";

type Tx = Prisma.TransactionClient;

const detailInclude = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  transitions: { orderBy: { createdAt: "asc" as const } },
  transactions: { orderBy: { createdAt: "asc" as const } },
  webhookEvents: {
    orderBy: { createdAt: "desc" as const },
    include: { deliveries: { orderBy: { attemptNumber: "asc" as const } } },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentDetail = Prisma.PaymentGetPayload<{ include: typeof detailInclude }>;

export async function findPaymentById(id: string): Promise<PaymentDetail | null> {
  return getPrisma().payment.findUnique({ where: { id }, include: detailInclude });
}

export async function findPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
  return getPrisma().payment.findUnique({ where: { idempotencyKey } });
}

export async function createPendingPayment(input: {
  merchantReference: string;
  amountMinor: number;
  currency: string;
  scenario: string;
  description?: string;
  idempotencyKey: string;
  actorId: string;
  requestId: string;
}): Promise<Payment> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          merchantReference: input.merchantReference,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "PENDING",
          scenario: input.scenario,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
          createdById: input.actorId,
        },
      });
      await tx.paymentStateTransition.create({
        data: {
          paymentId: payment.id,
          toStatus: "PENDING",
          reason: "Sandbox payment accepted for processing.",
          actorId: input.actorId,
        },
      });
      await writeAudit(tx, {
        actorId: input.actorId,
        action: "payment.created",
        resourceType: "payment",
        resourceId: payment.id,
        requestId: input.requestId,
        metadata: {
          merchantReference: input.merchantReference,
          amountMinor: input.amountMinor,
          currency: input.currency,
          scenario: input.scenario,
        },
      });
      return payment;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = uniqueTargets(error);
      if (target.includes("merchant_reference")) {
        throw new AppError(409, "MERCHANT_REFERENCE_CONFLICT", "A payment with this merchant reference already exists.");
      }
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key is already attached to a payment.");
    }
    throw error;
  }
}

export async function listPayments(query: {
  page: number;
  pageSize: number;
  status?: PaymentStatus;
  currency?: string;
  q?: string;
  from?: Date;
  to?: Date;
  sort: "createdAt:desc" | "createdAt:asc" | "amountMinor:desc" | "amountMinor:asc";
}) {
  const where: Prisma.PaymentWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.currency) where.currency = query.currency;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lt: query.to } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { merchantReference: { contains: query.q, mode: "insensitive" } },
      { providerReference: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const orderBy =
    query.sort === "amountMinor:asc"
      ? { amountMinor: "asc" as const }
      : query.sort === "amountMinor:desc"
        ? { amountMinor: "desc" as const }
        : query.sort === "createdAt:asc"
          ? { createdAt: "asc" as const }
          : { createdAt: "desc" as const };

  const prisma = getPrisma();
  const [total, rows] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
  ]);
  return { total, rows };
}

export async function transitionPayment(
  tx: Tx,
  input: {
    payment: Payment;
    to: PaymentStatus;
    reason: string;
    actorId: string | null;
    requestId?: string;
    patch?: {
      providerReference?: string | null;
      failureCode?: string | null;
      failureMessage?: string | null;
    };
    action: string;
  },
): Promise<Payment> {
  if (input.payment.status === input.to) {
    return input.payment;
  }
  assertTransition(input.payment.status, input.to);
  const updated = await tx.payment.updateMany({
    where: { id: input.payment.id, status: input.payment.status },
    data: {
      status: input.to,
      providerReference: input.patch?.providerReference ?? input.payment.providerReference,
      failureCode: input.patch?.failureCode === undefined ? input.payment.failureCode : input.patch.failureCode,
      failureMessage:
        input.patch?.failureMessage === undefined ? input.payment.failureMessage : input.patch.failureMessage,
    },
  });
  if (updated.count !== 1) {
    throw new AppError(409, "PAYMENT_CONFLICT", "The payment changed while it was being updated.");
  }
  await tx.paymentStateTransition.create({
    data: {
      paymentId: input.payment.id,
      fromStatus: input.payment.status,
      toStatus: input.to,
      reason: input.reason,
      actorId: input.actorId,
    },
  });
  await writeAudit(tx, {
    actorId: input.actorId,
    action: input.action,
    resourceType: "payment",
    resourceId: input.payment.id,
    requestId: input.requestId,
    metadata: { from: input.payment.status, to: input.to, reason: input.reason },
  });
  return tx.payment.findUniqueOrThrow({ where: { id: input.payment.id } });
}

export async function recordLedgerEntry(
  tx: Tx,
  payment: { id: string; providerReference: string | null; amountMinor: number; currency: string },
  outcome: "succeeded" | "failed" | "pending_auth" | "unknown",
): Promise<void> {
  const providerReference = payment.providerReference ?? payment.id;
  const mapping: Record<typeof outcome, { type: TransactionType; status: TransactionStatus; suffix: string }> = {
    succeeded: { type: "CAPTURE", status: "SUCCEEDED", suffix: "capture" },
    failed: { type: "AUTHORIZATION", status: "FAILED", suffix: "failure" },
    pending_auth: { type: "AUTHORIZATION", status: "PENDING", suffix: "auth" },
    unknown: { type: "AUTHORIZATION", status: "PENDING", suffix: "unknown" },
  };
  const chosen = mapping[outcome];
  const reference = `txn_${providerReference}_${chosen.suffix}`;
  const existing = await tx.transaction.findUnique({ where: { reference } });
  if (existing) return;
  await tx.transaction.create({
    data: {
      paymentId: payment.id,
      transactionType: chosen.type,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: chosen.status,
      reference,
      metadata: { source: "sandbox" },
    },
  });
}

export function providerEventIdFor(paymentId: string, eventType: string): string {
  return `evt_${createHash("sha256").update(`${paymentId}:${eventType}`).digest("hex").slice(0, 24)}`;
}
