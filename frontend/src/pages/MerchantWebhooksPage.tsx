import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Envelope } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorState, PageHeader, SkeletonRows, StatusBadge } from "../components/ui";
import { getErrorMessage } from "./shared";

const events = ["payment.succeeded", "payment.failed", "payment.refunded", "payment.voided", "payment.requires_reconciliation"];

type Endpoint = {
  id: string;
  url: string;
  description: string;
  eventTypes: string[];
  status: string;
  signingSecret?: string;
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  merchantReference: string | null;
  paymentId: string | null;
};

export function MerchantWebhooksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("http://localhost:4000/api/v1/merchant-webhooks/sink");
  const [description, setDescription] = useState("Local sandbox merchant");
  const [secret, setSecret] = useState<string | null>(null);
  const endpoints = useQuery({
    queryKey: ["merchant-endpoints"],
    queryFn: async () => (await api.get<Envelope<Endpoint[]>>("/merchant-webhooks")).data.data,
  });
  const deliveries = useQuery({
    queryKey: ["merchant-deliveries"],
    queryFn: async () => (await api.get<Envelope<Delivery[]>>("/merchant-webhooks/deliveries")).data.data,
  });
  const create = useMutation({
    mutationFn: async () =>
      (await api.post<Envelope<Endpoint>>("/merchant-webhooks", { url, description, eventTypes: events })).data.data,
    onSuccess: async (endpoint) => {
      setSecret(endpoint.signingSecret ?? null);
      toast.success("Endpoint saved. Copy the signing secret now.");
      await queryClient.invalidateQueries({ queryKey: ["merchant-endpoints"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const replay = useMutation({
    mutationFn: async (id: string) => api.post(`/merchant-webhooks/deliveries/${id}/replay`),
    onSuccess: async () => {
      toast.success("Delivery queued again.");
      await queryClient.invalidateQueries({ queryKey: ["merchant-deliveries"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const canWrite = user?.permissions.includes("merchant-webhooks:write") ?? false;
  const canReplay = user?.permissions.includes("merchant-webhooks:replay") ?? false;

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Reliability"
        title="Merchant events"
        description="PayGuard signs outbound events and retries them. The local sink stands in for a merchant server."
      />
      {secret ? (
        <section className="card p-4">
          <p className="text-sm font-semibold">Signing secret</p>
          <p className="mt-1 text-sm text-muted">Shown once. Store it with the merchant. It is not a payment credential.</p>
          <p className="mono mt-2 text-xs break-all">{secret}</p>
        </section>
      ) : null}
      {canWrite ? (
        <form
          className="card grid gap-3 p-4 md:grid-cols-[1.2fr_0.8fr_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label className="field">
            <span>Endpoint URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <label className="field">
            <span>Description</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <Button type="submit" disabled={create.isPending}>Add endpoint</Button>
        </form>
      ) : null}
      <section className="card">
        <h2 className="px-4 py-3 text-sm font-semibold">Endpoints</h2>
        {endpoints.isLoading ? <SkeletonRows /> : null}
        {endpoints.isError ? <ErrorState message={getErrorMessage(endpoints.error)} onRetry={() => void endpoints.refetch()} /> : null}
        {(endpoints.data ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Description</th><th>URL</th><th>Status</th></tr></thead>
              <tbody>
                {(endpoints.data ?? []).map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td>{endpoint.description}</td>
                    <td className="mono text-xs">{endpoint.url}</td>
                    <td><StatusBadge value={endpoint.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!endpoints.isLoading && (endpoints.data ?? []).length === 0 ? <p className="p-6 text-sm text-muted">No merchant endpoints yet.</p> : null}
      </section>
      <section className="card">
        <h2 className="px-4 py-3 text-sm font-semibold">Deliveries</h2>
        {deliveries.isLoading ? <SkeletonRows /> : null}
        {deliveries.isError ? <ErrorState message={getErrorMessage(deliveries.error)} onRetry={() => void deliveries.refetch()} /> : null}
        {(deliveries.data ?? []).length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Event</th><th>Payment</th><th>Status</th><th>Attempts</th><th>Error</th><th></th></tr></thead>
              <tbody>
                {(deliveries.data ?? []).map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.eventType}</td>
                    <td>{delivery.paymentId ? <Link className="text-accent" to={`/payments/${delivery.paymentId}`}>{delivery.merchantReference}</Link> : "—"}</td>
                    <td><StatusBadge value={delivery.status} /></td>
                    <td>{delivery.attempts}</td>
                    <td>{delivery.lastError ?? "—"}</td>
                    <td>
                      {canReplay && (delivery.status === "FAILED" || delivery.status === "DEAD_LETTER") ? (
                        <Button variant="secondary" onClick={() => replay.mutate(delivery.id)} disabled={replay.isPending}>Replay</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!deliveries.isLoading && (deliveries.data ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted">Deliveries appear after a payment succeeds, fails, is refunded, or is voided.</p>
        ) : null}
      </section>
    </div>
  );
}
