import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Envelope, Transaction } from "../api/types";
import { ErrorState, KeyValue, PageHeader, Pagination, SkeletonRows, StatusBadge } from "../components/ui";
import { formatMoney, formatWhen } from "../lib/format";
import { getErrorMessage } from "./shared";

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["transactions", page, status, q],
    queryFn: async () =>
      (
        await api.get<Envelope<Transaction[]>>("/transactions", {
          params: { page, pageSize: 20, ...(status ? { status } : {}), ...(q ? { q } : {}) },
        })
      ).data,
  });
  const rows = query.data?.data ?? [];
  return (
    <div>
      <PageHeader eyebrow="Ledger" title="Transactions" description="Authorization and capture records tied to sandbox payments." />
      <div className="card">
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-2">
          <label className="field"><span>Search</span><input value={q} onChange={(event) => { setPage(1); setQ(event.target.value); }} /></label>
          <label className="field">
            <span>Status</span>
            <select aria-label="Transaction status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
              <option value="">All</option>
              <option>PENDING</option>
              <option>SUCCEEDED</option>
              <option>FAILED</option>
            </select>
          </label>
        </div>
        {query.isLoading ? <SkeletonRows /> : null}
        {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? <p className="p-8 text-sm text-muted">No transactions match these filters.</p> : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Reference</th><th>Payment</th><th>Type</th><th>Status</th><th>Amount</th><th>Created</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><Link className="mono text-xs text-accent" to={`/transactions/${row.id}`}>{row.reference}</Link></td>
                    <td className="mono text-xs">{row.payment?.merchantReference ?? row.paymentId}</td>
                    <td>{row.transactionType}</td>
                    <td><StatusBadge value={row.status} /></td>
                    <td>{formatMoney(row.amountMinor, row.currency)}</td>
                    <td>{formatWhen(row.createdAt)}</td>
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

export function TransactionDetailPage() {
  const { id = "" } = useParams();
  const query = useQuery({
    queryKey: ["transaction", id],
    queryFn: async () => (await api.get<Envelope<Transaction>>(`/transactions/${id}`)).data.data,
  });
  const transaction = query.data;
  return (
    <div>
      <PageHeader eyebrow="Transaction" title={transaction?.reference ?? "Transaction"} />
      {query.isLoading ? <SkeletonRows /> : null}
      {query.isError ? <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
      {transaction ? (
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <KeyValue label="Type" value={transaction.transactionType} />
          <KeyValue label="Status" value={<StatusBadge value={transaction.status} />} />
          <KeyValue label="Amount" value={formatMoney(transaction.amountMinor, transaction.currency)} />
          <KeyValue label="Payment" value={<Link className="text-accent" to={`/payments/${transaction.paymentId}`}>{transaction.payment?.merchantReference ?? transaction.paymentId}</Link>} />
          <KeyValue label="Created" value={formatWhen(transaction.createdAt)} />
          <KeyValue label="Metadata" value={<pre className="mono text-xs whitespace-pre-wrap">{JSON.stringify(transaction.metadata, null, 2)}</pre>} />
        </section>
      ) : null}
    </div>
  );
}
