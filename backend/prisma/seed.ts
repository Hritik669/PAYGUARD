import bcrypt from "bcryptjs";
import { PrismaClient, type PaymentStatus } from "@prisma/client";
import { reconcileRecords } from "../src/modules/reconciliation/matcher";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@payguard.local";
const ANALYST_EMAIL = "analyst@payguard.local";
const ADMIN_PASSWORD = "PayGuard-Admin-Demo-1";
const ANALYST_PASSWORD = "PayGuard-Analyst-Demo-1";

function daysAgo(days: number, hour = 12): Date {
  const date = new Date();
  date.setUTCHours(hour, (days * 7) % 60, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo credentials while NODE_ENV=production. Set ALLOW_DEMO_SEED=true for one explicit run.");
  }

  const [existingUsers, existingPayments] = await Promise.all([prisma.user.count(), prisma.payment.count()]);
  if ((existingUsers > 0 || existingPayments > 0) && process.env.SEED_REPLACE !== "true") {
    throw new Error(
      "Demo data already exists. Refusing to delete it. Set SEED_REPLACE=true to replace the sandbox dataset.",
    );
  }

  await prisma.merchantDeliveryAttempt.deleteMany();
  await prisma.merchantDelivery.deleteMany();
  await prisma.merchantEndpoint.deleteMany();
  await prisma.merchantSinkReceipt.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.outboxMessage.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.paymentStateTransition.deleteMany();
  await prisma.reconciliationItem.deleteMany();
  await prisma.reconciliationRun.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.providerStatement.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.workerHeartbeat.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      name: "Amina Shah",
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: "ADMIN",
    },
  });
  const analyst = await prisma.user.create({
    data: {
      name: "Leo Martins",
      email: ANALYST_EMAIL,
      passwordHash: await bcrypt.hash(ANALYST_PASSWORD, 10),
      role: "ANALYST",
    },
  });

  type Draft = {
    merchantReference: string;
    amountMinor: number;
    currency: "USD" | "INR" | "EUR" | "GBP";
    status: PaymentStatus;
    scenario: string;
    description: string;
    day: number;
    statement?: { amountMinor: number; status: string } | null;
    duplicateEvent?: boolean;
    webhookStatus?: "PROCESSED" | "FAILED" | "DEAD_LETTER" | "RECEIVED";
    failTimes?: number;
  };

  const drafts: Draft[] = [];
  const currencies = ["USD", "INR", "EUR", "GBP"] as const;
  const cycle: PaymentStatus[] = ["SUCCEEDED", "SUCCEEDED", "SUCCEEDED", "FAILED", "PENDING", "PROCESSING"];
  for (let index = 0; index < 36; index += 1) {
    const status = cycle[index % cycle.length] ?? "SUCCEEDED";
    const currency = currencies[index % currencies.length] ?? "USD";
    drafts.push({
      merchantReference: `order_${1000 + index}`,
      amountMinor: 1500 + index * 375,
      currency,
      status,
      scenario: status === "FAILED" ? "decline" : status === "PROCESSING" ? "delayed_webhook" : "success",
      description: `Sandbox order ${1000 + index}`,
      day: index % 14,
      statement:
        status === "SUCCEEDED" || status === "FAILED"
          ? { amountMinor: 1500 + index * 375, status: status === "SUCCEEDED" ? "captured" : "declined" }
          : null,
      webhookStatus: status === "SUCCEEDED" || status === "FAILED" ? "PROCESSED" : undefined,
    });
  }

  drafts.push(
    {
      merchantReference: "order_amount_mismatch",
      amountMinor: 12500,
      currency: "USD",
      status: "SUCCEEDED",
      scenario: "success",
      description: "Captured locally, provider statement is short.",
      day: 1,
      statement: { amountMinor: 12000, status: "captured" },
      webhookStatus: "PROCESSED",
    },
    {
      merchantReference: "order_missing_provider",
      amountMinor: 8800,
      currency: "USD",
      status: "SUCCEEDED",
      scenario: "success",
      description: "Succeeded internally with no provider statement.",
      day: 2,
      statement: null,
      webhookStatus: "PROCESSED",
    },
    {
      merchantReference: "order_status_mismatch",
      amountMinor: 6400,
      currency: "EUR",
      status: "FAILED",
      scenario: "decline",
      description: "Marked declined locally, provider captured it.",
      day: 3,
      statement: { amountMinor: 6400, status: "captured" },
      webhookStatus: "PROCESSED",
    },
    {
      merchantReference: "order_duplicate_event",
      amountMinor: 4300,
      currency: "GBP",
      status: "SUCCEEDED",
      scenario: "success",
      description: "Two provider success events were stored.",
      day: 2,
      statement: { amountMinor: 4300, status: "captured" },
      duplicateEvent: true,
      webhookStatus: "PROCESSED",
    },
    {
      merchantReference: "order_unknown_outcome",
      amountMinor: 9900,
      currency: "INR",
      status: "REQUIRES_RECONCILIATION",
      scenario: "timeout",
      description: "Gateway timed out. Outcome is unknown.",
      day: 0,
      statement: { amountMinor: 9900, status: "unknown" },
    },
    {
      merchantReference: "order_retry_demo",
      amountMinor: 5100,
      currency: "USD",
      status: "PROCESSING",
      scenario: "delayed_webhook",
      description: "Waiting on a webhook that fails once before succeeding.",
      day: 0,
      statement: null,
      webhookStatus: "RECEIVED",
      failTimes: 1,
    },
  );

  const created = [];
  for (const [index, draft] of drafts.entries()) {
    const createdAt = daysAgo(draft.day, 9 + (index % 8));
    const providerReference = `sim_seed_${draft.merchantReference}`;
    const payment = await prisma.payment.create({
      data: {
        merchantReference: draft.merchantReference,
        providerReference,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        status: draft.status,
        scenario: draft.scenario,
        description: draft.description,
        failureCode: draft.status === "FAILED" ? "CARD_DECLINED" : draft.status === "REQUIRES_RECONCILIATION" ? "GATEWAY_TIMEOUT" : null,
        failureMessage:
          draft.status === "FAILED"
            ? "The simulated issuer declined this payment."
            : draft.status === "REQUIRES_RECONCILIATION"
              ? "The simulated gateway timed out before confirming an outcome."
              : null,
        createdById: index % 5 === 0 ? analyst.id : admin.id,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await prisma.paymentStateTransition.create({
      data: {
        paymentId: payment.id,
        toStatus: "PENDING",
        reason: "Sandbox payment accepted for processing.",
        actorId: admin.id,
        createdAt,
      },
    });
    if (draft.status !== "PENDING") {
      await prisma.paymentStateTransition.create({
        data: {
          paymentId: payment.id,
          fromStatus: draft.status === "REQUIRES_RECONCILIATION" ? "PROCESSING" : "PENDING",
          toStatus: draft.status,
          reason: "Seeded sandbox state.",
          actorId: admin.id,
          createdAt: new Date(createdAt.getTime() + 60_000),
        },
      });
    }
    const ledger =
      draft.status === "SUCCEEDED"
        ? { type: "CAPTURE" as const, status: "SUCCEEDED" as const, suffix: "capture" }
        : draft.status === "FAILED"
          ? { type: "AUTHORIZATION" as const, status: "FAILED" as const, suffix: "failure" }
          : { type: "AUTHORIZATION" as const, status: "PENDING" as const, suffix: "auth" };
    await prisma.transaction.create({
      data: {
        paymentId: payment.id,
        transactionType: ledger.type,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        status: ledger.status,
        reference: `txn_${providerReference}_${ledger.suffix}`,
        createdAt,
        metadata: { source: "seed" },
      },
    });
    if (draft.statement) {
      await prisma.providerStatement.create({
        data: {
          providerReference: `stmt_${providerReference}`,
          merchantReference: draft.merchantReference,
          amountMinor: draft.statement.amountMinor,
          currency: draft.currency,
          status: draft.statement.status,
          statementDate: createdAt,
          batchId: "sandbox-2026-10",
        },
      });
    }
    if (draft.webhookStatus) {
      const eventType = draft.status === "FAILED" ? "payment.failed" : "payment.succeeded";
      const event = await prisma.webhookEvent.create({
        data: {
          providerEventId: `evt_seed_${draft.merchantReference}`,
          eventType,
          paymentId: payment.id,
          payload: {
            id: `evt_seed_${draft.merchantReference}`,
            type: eventType,
            data: { paymentId: payment.id, failTimes: draft.failTimes ?? 0 },
          },
          status: draft.webhookStatus,
          attempts: draft.webhookStatus === "RECEIVED" ? 0 : 1,
          processedAt: draft.webhookStatus === "PROCESSED" ? createdAt : null,
          lastError: draft.webhookStatus === "DEAD_LETTER" ? "Seeded dead letter." : null,
          createdAt,
        },
      });
      await prisma.outboxMessage.create({
        data: {
          webhookEventId: event.id,
          type: eventType,
          payload: { id: event.providerEventId, type: eventType },
          availableAt: draft.webhookStatus === "RECEIVED" ? new Date() : createdAt,
          publishedAt: draft.webhookStatus === "RECEIVED" ? null : createdAt,
          createdAt,
        },
      });
      if (draft.webhookStatus !== "RECEIVED") {
        await prisma.webhookDelivery.create({
          data: {
            webhookEventId: event.id,
            attemptNumber: 1,
            status: draft.webhookStatus === "PROCESSED" ? "SUCCEEDED" : "FAILED",
            responseCode: draft.webhookStatus === "PROCESSED" ? 200 : 500,
            durationMs: 40,
            attemptedAt: createdAt,
          },
        });
      }
      if (draft.duplicateEvent) {
        await prisma.webhookEvent.create({
          data: {
            providerEventId: `evt_seed_${draft.merchantReference}_dup`,
            eventType,
            paymentId: payment.id,
            payload: { id: `evt_seed_${draft.merchantReference}_dup`, type: eventType },
            status: "PROCESSED",
            attempts: 1,
            processedAt: createdAt,
            createdAt,
          },
        });
      }
    }
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "payment.created",
        resourceType: "payment",
        resourceId: payment.id,
        requestId: `seed_${index}`,
        createdAt,
        metadata: { merchantReference: draft.merchantReference, status: draft.status },
      },
    });
    created.push(payment);
  }

  await prisma.providerStatement.create({
    data: {
      providerReference: "stmt_orphan_provider",
      merchantReference: "order_provider_only",
      amountMinor: 2222,
      currency: "USD",
      status: "captured",
      statementDate: daysAgo(1),
      batchId: "sandbox-2026-10",
    },
  });

  const missingProvider = created.find((payment) => payment.merchantReference === "order_missing_provider");
  const dead = await prisma.webhookEvent.create({
    data: {
      providerEventId: "evt_seed_dead_letter",
      eventType: "payment.failed",
      paymentId: missingProvider?.id,
      payload: { id: "evt_seed_dead_letter", type: "payment.failed", data: { failTimes: 0 } },
      status: "DEAD_LETTER",
      attempts: 5,
      lastError: "Sandbox provider kept failing until the retry budget was exhausted.",
      createdAt: daysAgo(1),
    },
  });
  await prisma.outboxMessage.create({
    data: {
      webhookEventId: dead.id,
      type: "payment.succeeded",
      payload: { id: dead.providerEventId },
      publishedAt: daysAgo(1),
      createdAt: daysAgo(1),
    },
  });
  await prisma.webhookDelivery.create({
    data: {
      webhookEventId: dead.id,
      attemptNumber: 5,
      status: "FAILED",
      responseCode: 500,
      durationMs: 80,
      errorSummary: "Retry budget exhausted.",
      attemptedAt: daysAgo(1),
    },
  });

  const payments = await prisma.payment.findMany();
  const statements = await prisma.providerStatement.findMany();
  const result = reconcileRecords({
    internal: payments.map((payment) => ({
      id: payment.id,
      merchantReference: payment.merchantReference,
      providerReference: payment.providerReference,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
    })),
    provider: statements.map((row) => ({
      providerReference: row.providerReference,
      merchantReference: row.merchantReference,
      amountMinor: row.amountMinor,
      currency: row.currency,
      status: row.status,
    })),
    duplicatePaymentIds: payments.filter((payment) => payment.merchantReference === "order_duplicate_event").map((payment) => payment.id),
  });
  const run = await prisma.reconciliationRun.create({
    data: {
      status: "COMPLETED",
      startedAt: daysAgo(0, 8),
      completedAt: daysAgo(0, 8),
      matchedCount: result.matchedCount,
      mismatchCount: result.mismatches.length,
      unresolvedCount: result.mismatches.length,
      triggeredById: admin.id,
      summary: { source: "seed" },
    },
  });
  if (result.mismatches.length > 0) {
    await prisma.reconciliationItem.createMany({
      data: result.mismatches.map((item) => ({
        runId: run.id,
        paymentId: item.paymentId,
        mismatchType: item.mismatchType,
        internalValue: item.internalValue ?? undefined,
        providerValue: item.providerValue ?? undefined,
      })),
    });
  }
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "reconciliation.completed",
      resourceType: "reconciliation_run",
      resourceId: run.id,
      metadata: { mismatches: result.mismatches.length, matched: result.matchedCount },
    },
  });

  const refundTarget = created.find((payment) => payment.status === "SUCCEEDED");
  if (refundTarget) {
    const refundAmount = Math.max(1, Math.floor(refundTarget.amountMinor / 2));
    await prisma.transaction.create({
      data: {
        paymentId: refundTarget.id,
        transactionType: "REFUND",
        amountMinor: refundAmount,
        currency: refundTarget.currency,
        status: "SUCCEEDED",
        reference: `txn_refund_seed_${refundTarget.merchantReference}`,
        metadata: { reason: "Seeded partial sandbox refund.", source: "sandbox" },
      },
    });
    await prisma.payment.update({ where: { id: refundTarget.id }, data: { status: "PARTIALLY_REFUNDED" } });
    await prisma.paymentStateTransition.create({
      data: {
        paymentId: refundTarget.id,
        fromStatus: "SUCCEEDED",
        toStatus: "PARTIALLY_REFUNDED",
        reason: "Seeded partial sandbox refund.",
        actorId: admin.id,
      },
    });
  }
  await prisma.merchantEndpoint.create({
    data: {
      url: "http://localhost:4000/api/v1/merchant-webhooks/sink",
      description: "Local sandbox merchant sink",
      signingSecret: "local-demo-merchant-webhook-secret-32",
      eventTypes: ["payment.succeeded", "payment.failed", "payment.refunded", "payment.voided", "payment.requires_reconciliation"],
    },
  });

  console.log(`Seeded ${created.length} payments, ${result.mismatches.length} reconciliation mismatches.`);
  console.log(`Admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Analyst ${ANALYST_EMAIL} / ${ANALYST_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
