import type { Payment, PaymentStatus, Prisma } from "@prisma/client";
import type { PaymentDetail } from "./repository";

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function presentTransaction(transaction: {
  id: string;
  paymentId: string;
  transactionType: string;
  amountMinor: number;
  currency: string;
  status: string;
  reference: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  payment?: { merchantReference: string; providerReference: string | null; status: PaymentStatus };
}) {
  return {
    id: transaction.id,
    paymentId: transaction.paymentId,
    transactionType: transaction.transactionType,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency.trim(),
    status: transaction.status,
    reference: transaction.reference,
    metadata: transaction.metadata,
    createdAt: transaction.createdAt.toISOString(),
    payment: transaction.payment
      ? {
          merchantReference: transaction.payment.merchantReference,
          providerReference: transaction.payment.providerReference,
          status: transaction.payment.status,
        }
      : undefined,
  };
}

export function presentPaymentSummary(payment: Payment & { createdBy?: { id: string; name: string } | null }) {
  return {
    id: payment.id,
    merchantReference: payment.merchantReference,
    providerReference: payment.providerReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency.trim(),
    status: payment.status,
    scenario: payment.scenario,
    description: payment.description,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    createdBy: payment.createdBy ? { id: payment.createdBy.id, name: payment.createdBy.name } : null,
  };
}

export function presentPaymentDetail(payment: PaymentDetail) {
  return {
    ...presentPaymentSummary(payment),
    idempotencyKey: payment.idempotencyKey,
    transitions: payment.transitions.map((transition) => ({
      id: transition.id,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      reason: transition.reason,
      actorId: transition.actorId,
      createdAt: transition.createdAt.toISOString(),
    })),
    transactions: payment.transactions.map((transaction) => presentTransaction(transaction)),
    webhookEvents: payment.webhookEvents.map((event) => ({
      id: event.id,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      status: event.status,
      attempts: event.attempts,
      lastError: event.lastError,
      nextAttemptAt: iso(event.nextAttemptAt),
      processedAt: iso(event.processedAt),
      createdAt: event.createdAt.toISOString(),
      deliveries: event.deliveries.map((delivery) => ({
        id: delivery.id,
        attemptNumber: delivery.attemptNumber,
        status: delivery.status,
        responseCode: delivery.responseCode,
        durationMs: delivery.durationMs,
        errorSummary: delivery.errorSummary,
        attemptedAt: delivery.attemptedAt.toISOString(),
        nextAttemptAt: iso(delivery.nextAttemptAt),
      })),
    })),
  };
}
