import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Envelope, ReconciliationItem, ReconciliationRun } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button, ErrorState, Modal, PageHeader, Pagination, SkeletonRows, StatusBadge } from "../components/ui";
import { formatWhen, labelize } from "../lib/format";
import { getErrorMessage } from "./shared";

export function ReconciliationPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["reconciliation", page],
    queryFn: async () => (await api.get<Envelope<ReconciliationRun[]>>("/reconciliation/runs", { params: { page, pageSize: 20 } })).data,
  });
  const run = useMutation({
    mutationFn: async () => (await api.post<Envelope<ReconciliationRun>>("/reconciliation/runs")).data.data,
    onSuccess: async () => {
      toast.success("Reconciliation run stored.");
      await queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const rows = query.data?.data ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Control"
        title="Reconciliation"
        description="Compare internal payments with the sandbox provider statement. Mismatches stay open until an administrator records a decision."
        actions={user?.permissions.includes("reconciliation:run") ? <Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Running…" : "Run reconciliation"}</Button> : null}
      />
      <div className="card">
        {query.isLoading ? <SkeletonRows /> : null}
        {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Started</th><th>Status</th><th>Matched</th><th>Mismatches</th><th>Unresolved</th><th>Operator</th></tr></thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="text-accent" to={`/reconciliation/${item.id}`}>{formatWhen(item.startedAt)}</Link></td>
                    <td><StatusBadge value={item.status} /></td>
                    <td>{item.matchedCount}</td>
                    <td>{item.mismatchCount}</td>
                    <td>{item.unresolvedCount}</td>
                    <td>{item.triggeredBy?.name ?? "—"}</td>
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

const resolveSchema = z.object({
  action: z.enum(["resolve", "ignore"]),
  note: z.string().trim().min(10, "Add a note of at least 10 characters."),
});

export function ReconciliationDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [selected, setSelected] = useState<ReconciliationItem | null>(null);
  const query = useQuery({
    queryKey: ["reconciliation", id],
    queryFn: async () => (await api.get<Envelope<ReconciliationRun>>(`/reconciliation/runs/${id}`)).data.data,
  });
  const run = query.data;
  return (
    <div>
      <PageHeader eyebrow="Reconciliation run" title={run ? formatWhen(run.startedAt) : "Run"} description={run ? `${run.matchedCount} matched · ${run.unresolvedCount} unresolved` : undefined} />
      {query.isLoading ? <SkeletonRows /> : null}
      {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
      {run ? (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Type</th><th>Payment</th><th>Status</th><th>Internal</th><th>Provider</th><th></th></tr></thead>
              <tbody>
                {(run.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td>{labelize(item.mismatchType)}</td>
                    <td>{item.payment ? <Link className="text-accent" to={`/payments/${item.paymentId}`}>{item.payment.merchantReference}</Link> : "—"}</td>
                    <td><StatusBadge value={item.status} /></td>
                    <td className="max-w-48 truncate text-xs">{JSON.stringify(item.internalValue)}</td>
                    <td className="max-w-48 truncate text-xs">{JSON.stringify(item.providerValue)}</td>
                    <td>
                      {item.status === "OPEN" && user?.permissions.includes("reconciliation:resolve") ? (
                        <Button variant="secondary" onClick={() => setSelected(item)}>Review</Button>
                      ) : item.resolutionNote ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {selected ? <ResolveDialog item={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ResolveDialog({ item, onClose }: { item: ReconciliationItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof resolveSchema>>({
    resolver: zodResolver(resolveSchema),
    defaultValues: { action: "resolve", note: "" },
  });
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof resolveSchema>) => api.post(`/reconciliation/items/${item.id}/resolve`, values),
    onSuccess: async () => {
      toast.success("Resolution recorded. The payment state was not changed automatically.");
      await queryClient.invalidateQueries({ queryKey: ["reconciliation"] });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  return (
    <Modal title={labelize(item.mismatchType)} onClose={onClose}>
      <form className="grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <label className="field">
          <span>Decision</span>
          <select {...form.register("action")}>
            <option value="resolve">Resolve</option>
            <option value="ignore">Ignore</option>
          </select>
        </label>
        <label className="field">
          <span>Note</span>
          <textarea rows={4} {...form.register("note")} />
          {form.formState.errors.note ? <em className="field-error">{form.formState.errors.note.message}</em> : null}
        </label>
        <Button type="submit" disabled={mutation.isPending}>Save decision</Button>
      </form>
    </Modal>
  );
}
