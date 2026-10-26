import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Envelope, PaymentDetail } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorState, PageHeader, SkeletonRows, StatusBadge } from "../components/ui";
import { formatMoney, formatWhen, labelize } from "../lib/format";
import { getErrorMessage } from "./shared";

type ExceptionItem = {
  kind: "unknown_outcome" | "reconciliation" | "webhook";
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  amountMinor: number | null;
  currency: string | null;
  href: string;
};

export function ExceptionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["exceptions"],
    queryFn: async () => (await api.get<Envelope<ExceptionItem[]>>("/exceptions")).data.data,
  });
  const decide = useMutation({
    mutationFn: async (input: { id: string; outcome: "success" | "decline" }) =>
      api.post<Envelope<PaymentDetail>>(`/exceptions/payments/${input.id}/decide`, {
        outcome: input.outcome,
        note: input.outcome === "success" ? "Operator confirmed the unknown payment succeeded." : "Operator confirmed the unknown payment failed.",
      }),
    onSuccess: async () => {
      toast.success("Exception decision recorded.");
      await queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const rows = query.data ?? [];
  const canDecide = user?.permissions.includes("exceptions:resolve") ?? false;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Exception queue"
        description="Unknown gateway results, open reconciliation mismatches, and webhook deliveries that still need a person."
      />
      <div className="card">
        {query.isLoading ? <SkeletonRows /> : null}
        {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Kind</th><th>Item</th><th>Detail</th><th>When</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td><StatusBadge value={item.kind} /></td>
                    <td><Link className="font-semibold text-accent" to={item.href}>{item.title}</Link></td>
                    <td>{labelize(item.detail)}{item.amountMinor != null && item.currency ? ` · ${formatMoney(item.amountMinor, item.currency)}` : ""}</td>
                    <td>{formatWhen(item.createdAt)}</td>
                    <td>
                      {item.kind === "unknown_outcome" && canDecide ? (
                        <div className="flex gap-2">
                          <Button onClick={() => decide.mutate({ id: item.id, outcome: "success" })} disabled={decide.isPending}>Succeeded</Button>
                          <Button variant="secondary" onClick={() => decide.mutate({ id: item.id, outcome: "decline" })} disabled={decide.isPending}>Failed</Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <p className="p-8 text-sm text-muted">No open exceptions. Unknown outcomes and failed webhooks will appear here.</p>
        ) : null}
      </div>
    </div>
  );
}
