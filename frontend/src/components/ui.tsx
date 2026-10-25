import type { ButtonHTMLAttributes, ReactNode } from "react";
import { labelize } from "../lib/format";

const statusClass: Record<string, string> = {
  SUCCEEDED: "bg-emerald-50 text-emerald-800",
  RESOLVED: "bg-emerald-50 text-emerald-800",
  FAILED: "bg-rose-50 text-rose-800",
  DEAD_LETTER: "bg-rose-50 text-rose-800",
  PENDING: "bg-amber-50 text-amber-800",
  OPEN: "bg-amber-50 text-amber-800",
  PROCESSING: "bg-sky-50 text-sky-800",
  RECEIVED: "bg-sky-50 text-sky-800",
  RETRY_SCHEDULED: "bg-sky-50 text-sky-800",
  REQUIRES_RECONCILIATION: "bg-violet-50 text-violet-800",
  IGNORED: "bg-slate-100 text-slate-700",
  PROCESSED: "bg-emerald-50 text-emerald-800",
  COMPLETED: "bg-emerald-50 text-emerald-800",
  RUNNING: "bg-sky-50 text-sky-800",
  up: "bg-emerald-50 text-emerald-800",
  ready: "bg-emerald-50 text-emerald-800",
  down: "bg-rose-50 text-rose-800",
  stale: "bg-amber-50 text-amber-800",
  not_ready: "bg-rose-50 text-rose-800",
};

export function StatusBadge({ value }: { value: string }) {
  return <span className={`badge ${statusClass[value] ?? "bg-slate-100 text-slate-700"}`}>{labelize(value)}</span>;
}

export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`btn btn-${variant}`} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-accent uppercase">{eyebrow}</p> : null}
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">This view could not be loaded</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SkeletonRows() {
  return (
    <div className="grid gap-3 p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="skel h-10" />
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
      <span>{total} records</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span>
          {page} / {Math.max(pageCount, 1)}
        </span>
        <Button variant="secondary" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy/50 p-4" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card max-h-[90vh] w-full max-w-lg overflow-auto p-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-secondary px-2 py-1" onClick={onClose} aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}
