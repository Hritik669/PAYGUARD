import { Link } from "react-router-dom";
import type { PaymentSummary } from "../api/types";
import { formatMoney, formatWhen } from "../lib/format";
import { EmptyState, ErrorState, SkeletonRows, StatusBadge } from "./ui";

export function PaymentTable({
  state,
  payments,
  message,
  onRetry,
}: {
  state: "loading" | "error" | "empty" | "ready";
  payments: PaymentSummary[];
  message?: string;
  onRetry?: () => void;
}) {
  if (state === "loading") return <SkeletonRows />;
  if (state === "error") return <ErrorState message={message ?? "Payments could not be loaded."} onRetry={onRetry} />;
  if (state === "empty") {
    return <EmptyState title="No payments in this view" body="Adjust the filters or create a sandbox payment." />;
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Merchant reference</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Scenario</th>
            <th>Provider reference</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                <Link className="mono text-xs font-medium text-accent" to={`/payments/${payment.id}`}>
                  {payment.merchantReference}
                </Link>
              </td>
              <td>{formatMoney(payment.amountMinor, payment.currency)}</td>
              <td>
                <StatusBadge value={payment.status} />
              </td>
              <td className="text-sm text-muted">{payment.scenario.replaceAll("_", " ")}</td>
              <td className="mono text-xs">{payment.providerReference ?? "—"}</td>
              <td>{formatWhen(payment.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
