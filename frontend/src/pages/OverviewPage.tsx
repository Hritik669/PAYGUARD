import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { DashboardSummary, Envelope } from "../api/types";
import { ErrorState, PageHeader, SkeletonRows, StatusBadge } from "../components/ui";
import { formatMoney, formatPercent, formatWhen, rangeFromDays } from "../lib/format";
import { getErrorMessage } from "./shared";

const colors: Record<string, string> = {
  SUCCEEDED: "#12805c",
  FAILED: "#d14343",
  PENDING: "#b7791f",
  PROCESSING: "#2b6cb0",
  REQUIRES_RECONCILIATION: "#6b46c1",
};

export function OverviewPage() {
  const [days, setDays] = useState(14);
  const range = rangeFromDays(days);
  const query = useQuery({
    queryKey: ["dashboard", days],
    queryFn: async () => {
      const response = await api.get<Envelope<DashboardSummary>>("/dashboard/summary", { params: range });
      return response.data.data;
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Monitor"
        title="Operations overview"
        description="Volume is reported per currency. Success rate uses only succeeded and failed payments."
        actions={
          <label className="field">
            <span className="sr-only">Date range</span>
            <select aria-label="Date range" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
        }
      />
      {query.isLoading ? <SkeletonRows /> : null}
      {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
      {query.data ? <OverviewBody data={query.data} /> : null}
    </div>
  );
}

function OverviewBody({ data }: { data: DashboardSummary }) {
  const volume = data.volumeByCurrency.map((row) => ({
    ...row,
    major: row.amountMinor / 100,
  }));
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Payments" value={String(data.counts.total)} hint={`${data.counts.pending} pending · ${data.counts.processing} processing`} />
        <Stat label="Succeeded" value={String(data.counts.succeeded)} hint={formatPercent(data.counts.successRate)} />
        <Stat label="Failed" value={String(data.counts.failed)} hint={formatPercent(data.counts.failureRate)} />
        <Stat label="Unknown outcome" value={String(data.counts.requiresReconciliation)} hint="Needs reconciliation" />
      </section>
      {(data.webhookFailures > 0 || data.openReconciliationItems > 0) && (
        <section className="grid gap-3 md:grid-cols-2">
          <Link to="/webhooks?status=FAILED" className="card p-4">
            <p className="text-sm text-muted">Webhook failures in range</p>
            <p className="mt-1 text-2xl font-semibold">{data.webhookFailures}</p>
          </Link>
          <Link to="/reconciliation" className="card p-4">
            <p className="text-sm text-muted">Open reconciliation items</p>
            <p className="mt-1 text-2xl font-semibold">{data.openReconciliationItems}</p>
          </Link>
        </section>
      )}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Succeeded volume by currency</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volume}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="currency" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => (typeof value === "number" ? value.toLocaleString() : String(value ?? ""))} />
                <Bar dataKey="major" fill="#2f5bff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Status distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.statusDistribution} dataKey="count" nameKey="status" innerRadius={52} outerRadius={80}>
                  {data.statusDistribution.map((entry) => (
                    <Cell key={entry.status} fill={colors[entry.status] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold">Recent payments</h2>
          <Link to="/payments" className="text-sm font-semibold text-accent">
            View all
          </Link>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="mono text-xs">{payment.merchantReference}</td>
                  <td>{formatMoney(payment.amountMinor, payment.currency)}</td>
                  <td>
                    <StatusBadge value={payment.status} />
                  </td>
                  <td>{formatWhen(payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </article>
  );
}
