import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Envelope, PaymentDetail } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorState, KeyValue, PageHeader, SkeletonRows, StatusBadge } from "../components/ui";
import { formatMoney, formatWhen } from "../lib/format";
import { getErrorMessage } from "./shared";

export function PaymentDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["payment", id],
    queryFn: async () => (await api.get<Envelope<PaymentDetail>>(`/payments/${id}`)).data.data,
  });
  const simulate = useMutation({
    mutationFn: async (outcome: "success" | "decline" | "ambiguous") =>
      (await api.post<Envelope<PaymentDetail>>(`/payments/${id}/simulate`, { outcome, note: `Operator simulated ${outcome}.` })).data.data,
    onSuccess: async (payment) => {
      toast.success(`Payment is now ${payment.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["payment", id] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const payment = query.data;
  const canSimulate = user?.permissions.includes("payments:simulate") ?? false;

  return (
    <div>
      <PageHeader
        eyebrow="Payment"
        title={payment?.merchantReference ?? "Payment detail"}
        description="State changes are conditional. Completed payments cannot be rewritten."
        actions={payment ? <StatusBadge value={payment.status} /> : null}
      />
      {query.isLoading ? <SkeletonRows /> : null}
      {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
      {payment ? (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="card p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue label="Amount" value={formatMoney(payment.amountMinor, payment.currency)} />
              <KeyValue label="Provider reference" value={<span className="mono text-xs">{payment.providerReference ?? "Not assigned"}</span>} />
              <KeyValue label="Scenario" value={payment.scenario} />
              <KeyValue label="Failure" value={payment.failureMessage ?? "None"} />
              <KeyValue label="Created" value={formatWhen(payment.createdAt)} />
              <KeyValue label="Updated" value={formatWhen(payment.updatedAt)} />
            </dl>
            {canSimulate ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => simulate.mutate("success")} disabled={simulate.isPending}>Simulate success</Button>
                <Button variant="secondary" onClick={() => simulate.mutate("decline")} disabled={simulate.isPending}>Simulate decline</Button>
                <Button variant="secondary" onClick={() => simulate.mutate("ambiguous")} disabled={simulate.isPending}>Mark unknown</Button>
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted">Your role can view this payment. Simulation is limited to administrators.</p>
            )}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">State history</h2>
            <ol className="grid gap-3">
              {payment.transitions.map((transition) => (
                <li key={transition.id} className="border-l-2 border-accent pl-3">
                  <p className="text-sm font-semibold">{transition.fromStatus ? `${transition.fromStatus} → ${transition.toStatus}` : transition.toStatus}</p>
                  <p className="text-sm text-muted">{transition.reason}</p>
                  <p className="text-xs text-muted">{formatWhen(transition.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="card xl:col-span-2">
            <h2 className="px-4 py-3 text-sm font-semibold">Transactions</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Reference</th><th>Type</th><th>Status</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {payment.transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td><Link className="mono text-xs text-accent" to={`/transactions/${transaction.id}`}>{transaction.reference}</Link></td>
                      <td>{transaction.transactionType}</td>
                      <td><StatusBadge value={transaction.status} /></td>
                      <td>{formatMoney(transaction.amountMinor, transaction.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card xl:col-span-2">
            <h2 className="px-4 py-3 text-sm font-semibold">Webhook events</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Event</th><th>Type</th><th>Status</th><th>Attempts</th></tr>
                </thead>
                <tbody>
                  {payment.webhookEvents.length === 0 ? (
                    <tr><td colSpan={4} className="text-muted">No webhook events yet.</td></tr>
                  ) : payment.webhookEvents.map((event) => (
                    <tr key={event.id}>
                      <td><Link className="mono text-xs text-accent" to={`/webhooks/${event.id}`}>{event.providerEventId}</Link></td>
                      <td>{event.eventType}</td>
                      <td><StatusBadge value={event.status} /></td>
                      <td>{event.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
