import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Envelope, PaymentSummary } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { PaymentTable } from "../components/PaymentTable";
import { Button, Modal, PageHeader, Pagination } from "../components/ui";
import { toMinorUnits } from "../lib/format";
import { getErrorMessage } from "./shared";

const createSchema = z.object({
  merchantReference: z.string().trim().min(4, "Use at least 4 characters.").regex(/^[A-Za-z0-9:_-]+$/, "Use letters, numbers, colon, underscore, or hyphen."),
  amount: z.string().refine((value) => toMinorUnits(value) !== null, "Enter a positive amount with up to 2 decimals."),
  currency: z.enum(["USD", "INR", "EUR", "GBP"]),
  scenario: z.enum(["success", "decline", "gateway_failure", "timeout", "delayed_webhook"]),
  description: z.string().trim().max(280).optional(),
});

type CreateValues = z.infer<typeof createSchema>;

export function PaymentsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [open, setOpen] = useState(false);
  const canCreate = user?.permissions.includes("payments:write") ?? false;
  const params = useMemo(
    () => ({ page, pageSize: 20, sort, ...(status ? { status } : {}), ...(currency ? { currency } : {}), ...(q ? { q } : {}) }),
    [page, status, currency, q, sort],
  );
  const query = useQuery({
    queryKey: ["payments", params],
    queryFn: async () => {
      const response = await api.get<Envelope<PaymentSummary[]>>("/payments", { params });
      return response.data;
    },
  });
  const payments = query.data?.data ?? [];
  const state = query.isLoading ? "loading" : query.isError ? "error" : payments.length === 0 ? "empty" : "ready";

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Payments"
        description="Sandbox charges with explicit states. A timeout is an unknown outcome, not a failure."
        actions={
          canCreate ? (
            <Button onClick={() => setOpen(true)}>New sandbox payment</Button>
          ) : (
            <p className="text-sm text-muted">Analysts can review payments but cannot create them.</p>
          )
        }
      />
      <div className="card">
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-4">
          <label className="field">
            <span>Search</span>
            <input value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} placeholder="Reference" />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} aria-label="Status">
              <option value="">All statuses</option>
              {["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "REQUIRES_RECONCILIATION", "VOIDED", "PARTIALLY_REFUNDED", "REFUNDED"].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Currency</span>
            <select value={currency} onChange={(event) => { setPage(1); setCurrency(event.target.value); }} aria-label="Currency">
              <option value="">All currencies</option>
              {["USD", "INR", "EUR", "GBP"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort">
              <option value="createdAt:desc">Newest</option>
              <option value="createdAt:asc">Oldest</option>
              <option value="amountMinor:desc">Amount high to low</option>
              <option value="amountMinor:asc">Amount low to high</option>
            </select>
          </label>
        </div>
        <PaymentTable state={state} payments={payments} message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        <Pagination page={page} pageCount={query.data?.meta?.pageCount ?? 1} total={query.data?.meta?.total ?? 0} onPage={setPage} />
      </div>
      {open ? <CreatePaymentDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function CreatePaymentDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { merchantReference: "", amount: "", currency: "USD", scenario: "success", description: "" },
  });
  const mutation = useMutation({
    mutationFn: async (values: CreateValues) => {
      const amountMinor = toMinorUnits(values.amount);
      const response = await api.post<Envelope<PaymentSummary>>(
        "/payments",
        {
          merchantReference: values.merchantReference,
          amountMinor,
          currency: values.currency,
          scenario: values.scenario,
          description: values.description || undefined,
        },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );
      return response.data.data;
    },
    onSuccess: async (payment) => {
      toast.success(`Payment ${payment.merchantReference} is ${payment.status}.`);
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Modal title="Create sandbox payment" onClose={onClose}>
      <form className="grid gap-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <label className="field">
          <span>Merchant reference</span>
          <input {...form.register("merchantReference")} />
          {form.formState.errors.merchantReference ? <em className="field-error">{form.formState.errors.merchantReference.message}</em> : null}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>Amount</span>
            <input inputMode="decimal" placeholder="25.99" {...form.register("amount")} />
            {form.formState.errors.amount ? <em className="field-error">{form.formState.errors.amount.message}</em> : null}
          </label>
          <label className="field">
            <span>Currency</span>
            <select {...form.register("currency")}>
              {["USD", "INR", "EUR", "GBP"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Sandbox scenario</span>
          <select {...form.register("scenario")}>
            <option value="success">Success</option>
            <option value="decline">Decline</option>
            <option value="gateway_failure">Temporary gateway failure</option>
            <option value="timeout">Timeout / unknown outcome</option>
            <option value="delayed_webhook">Delayed webhook</option>
          </select>
        </label>
        <label className="field">
          <span>Description</span>
          <input {...form.register("description")} />
        </label>
        <p className="text-xs text-muted">Idempotency key for this dialog: <span className="mono">{idempotencyKey}</span></p>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Submitting…" : "Create payment"}</Button>
      </form>
    </Modal>
  );
}
