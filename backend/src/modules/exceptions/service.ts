import { AppError } from "../../common/errors";
import { getPrisma } from "../../infrastructure/prisma";
import { writeAudit } from "../audit/service";
import { simulatePayment } from "../payments/service";
import type { AuthUser } from "../../types/express";

export async function listExceptions() {
  const [unknown, mismatches, webhooks] = await Promise.all([
    getPrisma().payment.findMany({
      where: { status: "REQUIRES_RECONCILIATION" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, merchantReference: true, amountMinor: true, currency: true, failureMessage: true, createdAt: true },
    }),
    getPrisma().reconciliationItem.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { payment: { select: { merchantReference: true } } },
    }),
    getPrisma().webhookEvent.findMany({
      where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { payment: { select: { merchantReference: true } } },
    }),
  ]);

  return [
    ...unknown.map((payment) => ({
      kind: "unknown_outcome" as const,
      id: payment.id,
      title: payment.merchantReference,
      detail: payment.failureMessage ?? "The gateway result is unknown.",
      createdAt: payment.createdAt.toISOString(),
      amountMinor: payment.amountMinor,
      currency: payment.currency.trim(),
      href: `/payments/${payment.id}`,
    })),
    ...mismatches.map((item) => ({
      kind: "reconciliation" as const,
      id: item.id,
      title: item.payment?.merchantReference ?? item.mismatchType,
      detail: item.mismatchType,
      createdAt: item.createdAt.toISOString(),
      amountMinor: null,
      currency: null,
      href: `/reconciliation/${item.runId}`,
    })),
    ...webhooks.map((event) => ({
      kind: "webhook" as const,
      id: event.id,
      title: event.payment?.merchantReference ?? event.providerEventId,
      detail: `${event.status}: ${event.lastError ?? event.eventType}`,
      createdAt: event.createdAt.toISOString(),
      amountMinor: null,
      currency: null,
      href: `/webhooks/${event.id}`,
    })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function decideUnknownOutcome(
  paymentId: string,
  actor: AuthUser,
  input: { outcome: "success" | "decline"; note: string },
  requestId: string,
) {
  const payment = await getPrisma().payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  if (payment.status !== "REQUIRES_RECONCILIATION") {
    throw new AppError(409, "EXCEPTION_NOT_OPEN", "Only an unknown payment outcome can be decided from the exception queue.");
  }
  const updated = await simulatePayment(paymentId, actor, { outcome: input.outcome, note: input.note }, requestId);
  await writeAudit(getPrisma(), {
    actorId: actor.id,
    action: "exception.decided",
    resourceType: "payment",
    resourceId: paymentId,
    requestId,
    metadata: { outcome: input.outcome },
  });
  return updated;
}
