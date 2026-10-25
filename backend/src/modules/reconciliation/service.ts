import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors";
import { getPrisma } from "../../infrastructure/prisma";
import { writeAudit } from "../audit/service";
import { reconcileRecords } from "./matcher";
import type { ResolveBody } from "./validators";

function presentRun(run: {
  id: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  matchedCount: number;
  mismatchCount: number;
  unresolvedCount: number;
  summary: Prisma.JsonValue | null;
  triggeredById: string | null;
  triggeredBy?: { id: string; name: string; email: string } | null;
}) {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    matchedCount: run.matchedCount,
    mismatchCount: run.mismatchCount,
    unresolvedCount: run.unresolvedCount,
    summary: run.summary,
    triggeredBy: run.triggeredBy ?? null,
  };
}

function presentItem(item: {
  id: string;
  runId: string;
  paymentId: string | null;
  mismatchType: string;
  status: string;
  internalValue: Prisma.JsonValue | null;
  providerValue: Prisma.JsonValue | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  payment?: { merchantReference: string; status: string } | null;
  resolvedBy?: { id: string; name: string } | null;
}) {
  return {
    id: item.id,
    runId: item.runId,
    paymentId: item.paymentId,
    mismatchType: item.mismatchType,
    status: item.status,
    internalValue: item.internalValue,
    providerValue: item.providerValue,
    resolutionNote: item.resolutionNote,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    payment: item.payment ?? null,
    resolvedBy: item.resolvedBy ?? null,
  };
}

export async function runReconciliation(actorId: string, requestId: string) {
  const prisma = getPrisma();
  const run = await prisma.reconciliationRun.create({
    data: { status: "RUNNING", triggeredById: actorId },
  });
  try {
    const [payments, statements, duplicateRows] = await Promise.all([
      prisma.payment.findMany(),
      prisma.providerStatement.findMany(),
      prisma.$queryRaw<Array<{ payment_id: string }>>`
        SELECT payment_id
        FROM webhook_events
        WHERE payment_id IS NOT NULL
        GROUP BY payment_id, event_type
        HAVING COUNT(*) > 1
      `,
    ]);
    const result = reconcileRecords({
      internal: payments.map((payment) => ({
        id: payment.id,
        merchantReference: payment.merchantReference,
        providerReference: payment.providerReference,
        amountMinor: payment.amountMinor,
        currency: payment.currency.trim(),
        status: payment.status,
      })),
      provider: statements.map((row) => ({
        providerReference: row.providerReference,
        merchantReference: row.merchantReference,
        amountMinor: row.amountMinor,
        currency: row.currency.trim(),
        status: row.status,
      })),
      duplicatePaymentIds: duplicateRows.map((row) => row.payment_id),
    });

    await prisma.$transaction(async (tx) => {
      if (result.mismatches.length > 0) {
        await tx.reconciliationItem.createMany({
          data: result.mismatches.map((item) => ({
            runId: run.id,
            paymentId: item.paymentId,
            mismatchType: item.mismatchType,
            status: "OPEN",
            internalValue: (item.internalValue ?? undefined) as Prisma.InputJsonValue | undefined,
            providerValue: (item.providerValue ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        });
      }
      await tx.reconciliationRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          matchedCount: result.matchedCount,
          mismatchCount: result.mismatches.length,
          unresolvedCount: result.mismatches.length,
          summary: {
            internalRecords: payments.length,
            providerRecords: statements.length,
          },
        },
      });
      await writeAudit(tx, {
        actorId,
        action: "reconciliation.completed",
        resourceType: "reconciliation_run",
        resourceId: run.id,
        requestId,
        metadata: { matched: result.matchedCount, mismatches: result.mismatches.length },
      });
    });
    return getReconciliationRun(run.id);
  } catch (error) {
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", completedAt: new Date() },
    });
    throw error;
  }
}

export async function listReconciliationRuns(page: number, pageSize: number) {
  const prisma = getPrisma();
  const where = {};
  const [total, rows] = await prisma.$transaction([
    prisma.reconciliationRun.count({ where }),
    prisma.reconciliationRun.findMany({
      where,
      include: { triggeredBy: { select: { id: true, name: true, email: true } } },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, items: rows.map((row) => presentRun(row)) };
}

export async function getReconciliationRun(id: string) {
  const run = await getPrisma().reconciliationRun.findUnique({
    where: { id },
    include: {
      triggeredBy: { select: { id: true, name: true, email: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          payment: { select: { merchantReference: true, status: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!run) throw new AppError(404, "RECONCILIATION_NOT_FOUND", "Reconciliation run not found.");
  return { ...presentRun(run), items: run.items.map((item) => presentItem(item)) };
}

export async function resolveReconciliationItem(id: string, actorId: string, input: ResolveBody, requestId: string) {
  const prisma = getPrisma();
  const existing = await prisma.reconciliationItem.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "RECONCILIATION_ITEM_NOT_FOUND", "Reconciliation item not found.");
  if (existing.status !== "OPEN") return presentItem(await reloadItem(id));

  await prisma.$transaction(async (tx) => {
    const updated = await tx.reconciliationItem.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: input.action === "resolve" ? "RESOLVED" : "IGNORED",
        resolutionNote: input.note,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });
    if (updated.count === 1) {
      await tx.$executeRaw`
        UPDATE reconciliation_runs
        SET unresolved_count = GREATEST(unresolved_count - 1, 0)
        WHERE id = ${existing.runId}::uuid
      `;
      await writeAudit(tx, {
        actorId,
        action: input.action === "resolve" ? "reconciliation.item_resolved" : "reconciliation.item_ignored",
        resourceType: "reconciliation_item",
        resourceId: id,
        requestId,
        metadata: { note: input.note, mismatchType: existing.mismatchType },
      });
    }
  });
  return presentItem(await reloadItem(id));
}

async function reloadItem(id: string) {
  const item = await getPrisma().reconciliationItem.findUniqueOrThrow({
    where: { id },
    include: {
      payment: { select: { merchantReference: true, status: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });
  return item;
}
