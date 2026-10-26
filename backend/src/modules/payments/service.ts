import type { Payment, PaymentStatus, Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { getPrisma } from "../../infrastructure/prisma";
import { incrementCacheVersion } from "../../infrastructure/cache";
import { randomBytes } from "crypto";
import { attachIdempotencyResource, executeIdempotent } from "../idempotency/service";
import { enqueueMerchantNotifications } from "../merchant-webhooks/enqueue";
import { ensureWebhookQueued } from "../webhooks/outbox";
import { assertRefundable, assertVoidable, refundedMinor } from "./adjustments";
import { paymentGateway, deterministicProviderReference, type GatewayResult, type GatewayScenario } from "./gateway";
import { presentPaymentDetail, presentPaymentSummary } from "./presenter";
import {
  createPendingPayment,
  findPaymentById,
  findPaymentByIdempotencyKey,
  providerEventIdFor,
  recordLedgerEntry,
  transitionPayment,
  listPayments,
} from "./repository";
import type { CreatePaymentBody, PaymentListQuery, SimulateBody } from "./validators";
import type { AuthUser } from "../../types/express";

async function requireDetail(id: string) {
  const payment = await findPaymentById(id);
  if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  return payment;
}

function statusCodeFor(status: PaymentStatus): number {
  if (status === "PROCESSING" || status === "REQUIRES_RECONCILIATION") return 202;
  return 201;
}

async function applyGatewayResult(
  payment: Payment,
  result: GatewayResult,
  actorId: string,
  requestId: string,
): Promise<Payment> {
  if (result.kind === "unavailable") {
    await getPrisma().payment.update({
      where: { id: payment.id },
      data: { failureCode: result.failureCode, failureMessage: result.failureMessage },
    });
    throw new AppError(503, "GATEWAY_UNAVAILABLE", result.failureMessage);
  }

  const target: PaymentStatus =
    result.kind === "approved"
      ? "SUCCEEDED"
      : result.kind === "declined"
        ? "FAILED"
        : result.kind === "accepted"
          ? "PROCESSING"
          : "REQUIRES_RECONCILIATION";

  if (payment.status === target && payment.providerReference === result.providerReference) {
    return payment;
  }

  return getPrisma().$transaction(async (tx) => {
    const current = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!current) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
    const next = await transitionPayment(tx, {
      payment: current,
      to: target,
      reason:
        result.kind === "ambiguous"
          ? result.failureMessage
          : `Sandbox gateway returned ${result.kind}.`,
      actorId,
      requestId,
      action: "payment.status_changed",
      patch: {
        providerReference: result.providerReference,
        failureCode: result.kind === "declined" || result.kind === "ambiguous" ? result.failureCode : null,
        failureMessage: result.kind === "declined" || result.kind === "ambiguous" ? result.failureMessage : null,
      },
    });

    if (result.kind === "approved") await recordLedgerEntry(tx, next, "succeeded");
    if (result.kind === "declined") await recordLedgerEntry(tx, next, "failed");
    if (result.kind === "accepted") await recordLedgerEntry(tx, next, "pending_auth");
    if (result.kind === "ambiguous") await recordLedgerEntry(tx, next, "unknown");
    const merchantEvent =
      result.kind === "approved"
        ? "payment.succeeded"
        : result.kind === "declined"
          ? "payment.failed"
          : result.kind === "ambiguous"
            ? "payment.requires_reconciliation"
            : null;
    if (merchantEvent) {
      await enqueueMerchantNotifications(tx, {
        eventType: merchantEvent,
        paymentId: next.id,
        payload: {
          type: merchantEvent,
          data: {
            paymentId: next.id,
            merchantReference: next.merchantReference,
            amountMinor: next.amountMinor,
            currency: next.currency,
            status: next.status,
          },
        },
      });
    }

    if (result.kind === "approved" || result.kind === "declined" || result.kind === "accepted") {
      const eventType = result.eventType;
      const providerEventId = providerEventIdFor(next.id, eventType);
      await ensureWebhookQueued(tx, {
        providerEventId,
        eventType,
        paymentId: next.id,
        availableAt: new Date(Date.now() + result.delayMs),
        payload: {
          id: providerEventId,
          type: eventType,
          data: {
            paymentId: next.id,
            providerReference: result.providerReference,
            merchantReference: next.merchantReference,
            amountMinor: next.amountMinor,
            currency: next.currency,
            failTimes: 0,
          },
        },
      });
    }
    return next;
  });
}

export async function createPayment(actor: AuthUser, input: CreatePaymentBody, idempotencyKey: string, requestId: string) {
  const result = await executeIdempotent({
    scope: "payments.create",
    key: idempotencyKey,
    userId: actor.id,
    requestBody: input,
    handler: async ({ recordId, resourceId }) => {
      let payment =
        (resourceId ? await getPrisma().payment.findUnique({ where: { id: resourceId } }) : null) ??
        (await findPaymentByIdempotencyKey(idempotencyKey));

      if (!payment) {
        payment = await createPendingPayment({
          ...input,
          idempotencyKey,
          actorId: actor.id,
          requestId,
        });
      }
      await attachIdempotencyResource(recordId, payment.id);

      if (payment.status === "PENDING") {
        const gatewayResult = await paymentGateway.authorize({
          paymentId: payment.id,
          scenario: input.scenario as GatewayScenario,
          merchantReference: payment.merchantReference,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
        });
        payment = await applyGatewayResult(payment, gatewayResult, actor.id, requestId);
      }

      await incrementCacheVersion("dashboard");
      const detail = await requireDetail(payment.id);
      return {
        statusCode: statusCodeFor(detail.status),
        data: presentPaymentDetail(detail),
        resourceId: detail.id,
      };
    },
  });

  return result;
}

export async function getPayment(id: string) {
  return presentPaymentDetail(await requireDetail(id));
}

export async function getPaymentList(query: PaymentListQuery) {
  const { total, rows } = await listPayments(query);
  return { total, items: rows.map((row) => presentPaymentSummary(row)) };
}

export async function simulatePayment(id: string, actor: AuthUser, input: SimulateBody, requestId: string) {
  const existing = await getPrisma().payment.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  const target: PaymentStatus =
    input.outcome === "success" ? "SUCCEEDED" : input.outcome === "decline" ? "FAILED" : "REQUIRES_RECONCILIATION";
  if (existing.status !== target) {
    await getPrisma().$transaction(async (tx) => {
      const current = await tx.payment.findUnique({ where: { id } });
      if (!current) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
      const providerReference = current.providerReference ?? deterministicProviderReference(current.id);
      const next = await transitionPayment(tx, {
        payment: current,
        to: target,
        reason: input.note ?? `Sandbox operator simulated ${input.outcome}.`,
        actorId: actor.id,
        requestId,
        action: "payment.simulated",
        patch: {
          providerReference,
          failureCode: input.outcome === "decline" ? "SANDBOX_DECLINED" : input.outcome === "ambiguous" ? "GATEWAY_TIMEOUT" : null,
          failureMessage:
            input.outcome === "decline"
              ? "An operator marked this sandbox payment as declined."
              : input.outcome === "ambiguous"
                ? "An operator marked this sandbox payment as an unknown outcome."
                : null,
        },
      });
      if (input.outcome === "success") await recordLedgerEntry(tx, next, "succeeded");
      if (input.outcome === "decline") await recordLedgerEntry(tx, next, "failed");
      if (input.outcome === "ambiguous") await recordLedgerEntry(tx, next, "unknown");
      const merchantEvent =
        input.outcome === "success"
          ? "payment.succeeded"
          : input.outcome === "decline"
            ? "payment.failed"
            : "payment.requires_reconciliation";
      await enqueueMerchantNotifications(tx, {
        eventType: merchantEvent,
        paymentId: next.id,
        payload: {
          type: merchantEvent,
          data: {
            paymentId: next.id,
            merchantReference: next.merchantReference,
            amountMinor: next.amountMinor,
            currency: next.currency,
            status: next.status,
          },
        },
      });
    });
    await incrementCacheVersion("dashboard");
  }
  return presentPaymentDetail(await requireDetail(id));
}

export async function refundPayment(
  id: string,
  actor: AuthUser,
  input: { amountMinor: number; reason: string },
  idempotencyKey: string,
  requestId: string,
) {
  return executeIdempotent({
    scope: "payments.refund",
    key: idempotencyKey,
    userId: actor.id,
    requestBody: { id, ...input },
    handler: async () => {
      await getPrisma().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.payment.findUnique({ where: { id }, include: { transactions: true } });
        if (!current) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
        const already = refundedMinor(current.transactions);
        const to = assertRefundable(current.status, current.amountMinor, already, input.amountMinor);
        const next = await transitionPayment(tx, {
          payment: current,
          to,
          reason: input.reason,
          actorId: actor.id,
          requestId,
          action: "payment.refunded",
        });
        await tx.transaction.create({
          data: {
            paymentId: next.id,
            transactionType: "REFUND",
            amountMinor: input.amountMinor,
            currency: next.currency,
            status: "SUCCEEDED",
            reference: `txn_refund_${randomBytes(8).toString("hex")}`,
            metadata: { reason: input.reason, source: "sandbox" },
          },
        });
        await enqueueMerchantNotifications(tx, {
          eventType: "payment.refunded",
          paymentId: next.id,
          payload: {
            type: "payment.refunded",
            data: {
              paymentId: next.id,
              merchantReference: next.merchantReference,
              amountMinor: input.amountMinor,
              currency: next.currency,
              status: to,
            },
          },
        });
      });
      await incrementCacheVersion("dashboard");
      return { statusCode: 200, data: presentPaymentDetail(await requireDetail(id)), resourceId: id };
    },
  });
}

export async function voidPayment(
  id: string,
  actor: AuthUser,
  input: { reason: string },
  idempotencyKey: string,
  requestId: string,
) {
  return executeIdempotent({
    scope: "payments.void",
    key: idempotencyKey,
    userId: actor.id,
    requestBody: { id, ...input },
    handler: async () => {
      await getPrisma().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await tx.payment.findUnique({ where: { id } });
        if (!current) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
        assertVoidable(current.status);
        const next = await transitionPayment(tx, {
          payment: current,
          to: "VOIDED",
          reason: input.reason,
          actorId: actor.id,
          requestId,
          action: "payment.voided",
        });
        await tx.transaction.create({
          data: {
            paymentId: next.id,
            transactionType: "VOID",
            amountMinor: next.amountMinor,
            currency: next.currency,
            status: "SUCCEEDED",
            reference: `txn_void_${next.id}`,
            metadata: { reason: input.reason, source: "sandbox" },
          },
        });
        await enqueueMerchantNotifications(tx, {
          eventType: "payment.voided",
          paymentId: next.id,
          payload: {
            type: "payment.voided",
            data: {
              paymentId: next.id,
              merchantReference: next.merchantReference,
              amountMinor: next.amountMinor,
              currency: next.currency,
              status: "VOIDED",
            },
          },
        });
      });
      await incrementCacheVersion("dashboard");
      return { statusCode: 200, data: presentPaymentDetail(await requireDetail(id)), resourceId: id };
    },
  });
}

export type PaymentJson = ReturnType<typeof presentPaymentDetail>;

export function asPaymentJson(value: Prisma.JsonValue | unknown): PaymentJson {
  return value as PaymentJson;
}
