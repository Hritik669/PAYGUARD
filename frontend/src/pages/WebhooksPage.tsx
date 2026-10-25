import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Envelope, WebhookEvent } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorState, PageHeader, Pagination, SkeletonRows, StatusBadge } from "../components/ui";
import { formatWhen } from "../lib/format";
import { getErrorMessage } from "./shared";

export function WebhooksPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: ["webhooks", page, status],
    queryFn: async () =>
      (await api.get<Envelope<WebhookEvent[]>>("/webhooks", { params: { page, pageSize: 20, ...(status ? { status } : {}) } })).data,
  });
  const rows = query.data?.data ?? [];
  return (
    <div>
      <PageHeader eyebrow="Reliability" title="Webhooks" description="Events are stored before acknowledgement and processed at least once." />
      <div className="card">
        <div className="border-b border-line p-4">
          <label className="field max-w-xs">
            <span>Status</span>
            <select aria-label="Webhook status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
              <option value="">All</option>
              {["RECEIVED", "PROCESSING", "PROCESSED", "FAILED", "DEAD_LETTER"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {query.isLoading ? <SkeletonRows /> : null}
        {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Provider event</th><th>Type</th><th>Payment</th><th>Status</th><th>Attempts</th><th>Created</th></tr></thead>
              <tbody>
                {rows.map((event) => (
                  <tr key={event.id}>
                    <td><Link className="mono text-xs text-accent" to={`/webhooks/${event.id}`}>{event.providerEventId}</Link></td>
                    <td>{event.eventType}</td>
                    <td className="mono text-xs">{event.payment?.merchantReference ?? "—"}</td>
                    <td><StatusBadge value={event.status} /></td>
                    <td>{event.attempts}</td>
                    <td>{formatWhen(event.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!query.isLoading && rows.length === 0 ? <p className="p-8 text-sm text-muted">No webhook events match this filter.</p> : null}
        <Pagination page={page} pageCount={query.data?.meta?.pageCount ?? 1} total={query.data?.meta?.total ?? 0} onPage={setPage} />
      </div>
    </div>
  );
}

export function WebhookDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["webhook", id],
    queryFn: async () => (await api.get<Envelope<WebhookEvent>>(`/webhooks/${id}`)).data.data,
  });
  const replay = useMutation({
    mutationFn: async () => (await api.post<Envelope<WebhookEvent>>(`/webhooks/${id}/replay`)).data.data,
    onSuccess: async () => {
      toast.success("Event queued for replay.");
      await queryClient.invalidateQueries({ queryKey: ["webhook", id] });
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const event = query.data;
  const canReplay = user?.permissions.includes("webhooks:replay") && (event?.status === "FAILED" || event?.status === "DEAD_LETTER");
  return (
    <div>
      <PageHeader
        eyebrow="Webhook"
        title={event?.providerEventId ?? "Webhook event"}
        actions={canReplay ? <Button onClick={() => replay.mutate()} disabled={replay.isPending}>Replay event</Button> : null}
      />
      {query.isLoading ? <SkeletonRows /> : null}
      {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
      {event ? (
        <div className="grid gap-4">
          <section className="card grid gap-3 p-5 sm:grid-cols-3">
            <div><p className="text-xs text-muted uppercase">Type</p><p>{event.eventType}</p></div>
            <div><p className="text-xs text-muted uppercase">Status</p><StatusBadge value={event.status} /></div>
            <div><p className="text-xs text-muted uppercase">Last error</p><p className="text-sm">{event.lastError ?? "None"}</p></div>
          </section>
          <section className="card">
            <h2 className="px-4 py-3 text-sm font-semibold">Delivery attempts</h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Attempt</th><th>Status</th><th>Code</th><th>Duration</th><th>Error</th><th>When</th></tr></thead>
                <tbody>
                  {(event.deliveries ?? []).length === 0 ? <tr><td colSpan={6}>No attempts recorded yet.</td></tr> : (event.deliveries ?? []).map((delivery) => (
                    <tr key={delivery.id}>
                      <td>{delivery.attemptNumber}</td>
                      <td><StatusBadge value={delivery.status} /></td>
                      <td>{delivery.responseCode ?? "—"}</td>
                      <td>{delivery.durationMs ?? "—"} ms</td>
                      <td>{delivery.errorSummary ?? "—"}</td>
                      <td>{formatWhen(delivery.attemptedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Payload</h2>
            <pre className="mono overflow-auto text-xs">{JSON.stringify(event.payload, null, 2)}</pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}
