import { getPrisma } from "../../infrastructure/prisma";
import { getOrSetJson, readCacheVersion } from "../../infrastructure/cache";
import { presentPaymentSummary } from "../payments/presenter";

type DayRow = { day: Date; succeeded: number; failed: number; total: number };
type CurrencyRow = { currency: string; volume: bigint | number; count: number };
type StatusRow = { status: string; count: number };

function asNumber(value: bigint | number): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number)) {
    throw new Error("Aggregate exceeded the safe integer range.");
  }
  return number;
}

function defaultRange(from?: Date, to?: Date) {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

async function loadSummary(input: { from: Date; to: Date; currency?: string }) {
  const prisma = getPrisma();
  const currency = input.currency ?? null;
  const [dayRows, currencyRows, statusRows, recent, webhookFailures, openItems] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
             COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
             COUNT(*)::int AS total
      FROM payments
      WHERE created_at >= ${input.from}
        AND created_at < ${input.to}
        AND (${currency}::text IS NULL OR currency = ${currency})
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<CurrencyRow[]>`
      SELECT currency,
             COALESCE(SUM(amount_minor) FILTER (WHERE status = 'SUCCEEDED'), 0)::bigint AS volume,
             COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS count
      FROM payments
      WHERE created_at >= ${input.from}
        AND created_at < ${input.to}
        AND (${currency}::text IS NULL OR currency = ${currency})
      GROUP BY currency
      ORDER BY currency
    `,
    prisma.$queryRaw<StatusRow[]>`
      SELECT status::text AS status, COUNT(*)::int AS count
      FROM payments
      WHERE created_at >= ${input.from}
        AND created_at < ${input.to}
        AND (${currency}::text IS NULL OR currency = ${currency})
      GROUP BY status
    `,
    prisma.payment.findMany({
      where: {
        createdAt: { gte: input.from, lt: input.to },
        ...(input.currency ? { currency: input.currency } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.webhookEvent.count({
      where: {
        status: { in: ["FAILED", "DEAD_LETTER"] },
        createdAt: { gte: input.from, lt: input.to },
      },
    }),
    prisma.reconciliationItem.count({ where: { status: "OPEN" } }),
  ]);

  const counts = {
    total: 0,
    succeeded: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    requiresReconciliation: 0,
  };
  for (const row of statusRows) {
    counts.total += row.count;
    if (row.status === "SUCCEEDED") counts.succeeded = row.count;
    if (row.status === "FAILED") counts.failed = row.count;
    if (row.status === "PENDING") counts.pending = row.count;
    if (row.status === "PROCESSING") counts.processing = row.count;
    if (row.status === "REQUIRES_RECONCILIATION") counts.requiresReconciliation = row.count;
  }
  const decided = counts.succeeded + counts.failed;
  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    currency: input.currency ?? null,
    counts: {
      ...counts,
      successRate: decided === 0 ? 0 : counts.succeeded / decided,
      failureRate: decided === 0 ? 0 : counts.failed / decided,
    },
    volumeByCurrency: currencyRows.map((row) => ({
      currency: row.currency.trim(),
      amountMinor: asNumber(row.volume),
      count: row.count,
    })),
    volumeByDay: dayRows.map((row) => ({
      date: row.day.toISOString(),
      succeeded: row.succeeded,
      failed: row.failed,
      total: row.total,
    })),
    statusDistribution: statusRows.map((row) => ({ status: row.status, count: row.count })),
    webhookFailures,
    openReconciliationItems: openItems,
    recentPayments: recent.map((payment) => presentPaymentSummary(payment)),
  };
}

export async function getDashboardSummary(query: { from?: Date; to?: Date; currency?: string }) {
  const range = defaultRange(query.from, query.to);
  const version = await readCacheVersion("dashboard");
  const key = `dashboard:summary:${version}:${range.from.toISOString()}:${range.to.toISOString()}:${query.currency ?? "all"}`;
  return getOrSetJson(key, 30, () => loadSummary({ ...range, currency: query.currency }));
}
