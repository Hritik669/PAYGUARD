import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AuditLog, Envelope, HealthDetails } from "../api/types";
import { ErrorState, PageHeader, Pagination, SkeletonRows, StatusBadge } from "../components/ui";
import { formatWhen } from "../lib/format";
import { getErrorMessage } from "./shared";

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["audit", page, q],
    queryFn: async () => (await api.get<Envelope<AuditLog[]>>("/audit-logs", { params: { page, pageSize: 20, ...(q ? { q } : {}) } })).data,
  });
  const rows = query.data?.data ?? [];
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Audit log" description="Read-only history of sign-ins, payment changes, replays, and reconciliation decisions." />
      <div className="card">
        <div className="border-b border-line p-4">
          <label className="field max-w-sm"><span>Search</span><input value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} placeholder="Action or resource" /></label>
        </div>
        {query.isLoading ? <SkeletonRows /> : null}
        {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Request</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>{row.actor?.name ?? "System"}</td>
                    <td className="mono text-xs">{row.action}</td>
                    <td className="mono text-xs">{row.resourceType}{row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ""}</td>
                    <td className="mono text-xs">{row.requestId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Pagination page={page} pageCount={query.data?.meta?.pageCount ?? 1} total={query.data?.meta?.total ?? 0} onPage={setPage} />
      </div>
    </div>
  );
}

export function HealthPage() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.get<Envelope<HealthDetails>>("/health")).data.data,
    refetchInterval: 10000,
  });
  const health = query.data;
  return (
    <div>
      <PageHeader eyebrow="Platform" title="System health" description="Dependency status and queue depth. Credentials are not shown." />
      {query.isLoading ? <SkeletonRows /> : null}
      {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
      {health ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <HealthCard label="API" value={health.status} detail={`${health.uptimeSeconds}s uptime`} />
          <HealthCard label="PostgreSQL" value={health.database} detail="Authoritative payment state" />
          <HealthCard label="Redis" value={health.redis} detail="Cache, rate limits, and queue" />
          <HealthCard label="Worker" value={health.worker.status} detail={health.worker.lastSeenAt ? formatWhen(health.worker.lastSeenAt) : "No heartbeat yet"} />
          <HealthCard label="Queue waiting" value={String(health.queue?.waiting ?? "—")} detail={`${health.queue?.failed ?? 0} failed jobs`} />
          <HealthCard label="Sandbox" value={health.sandbox ? "enabled" : "disabled"} detail={health.environment ?? "local"} />
        </div>
      ) : null}
    </div>
  );
}

function HealthCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <div className="mt-3">
        {["up", "down", "ready", "not_ready", "stale"].includes(value) ? <StatusBadge value={value} /> : <p className="text-2xl font-semibold">{value}</p>}
      </div>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}

export function NotFoundPage() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">That route is not part of the PayGuard console.</p>
      </div>
    </div>
  );
}
