export type Role = "ADMIN" | "ANALYST";

export type Permission =
  | "payments:read"
  | "payments:write"
  | "payments:simulate"
  | "transactions:read"
  | "webhooks:read"
  | "webhooks:replay"
  | "reconciliation:read"
  | "reconciliation:run"
  | "reconciliation:resolve"
  | "audit:read"
  | "dashboard:read"
  | "health:read";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: Permission[];
};

export type PageMeta = {
  requestId?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  pageCount?: number;
  replayed?: boolean;
};

export type Envelope<T> = { data: T; meta?: PageMeta };

export type PaymentStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REQUIRES_RECONCILIATION";

export type PaymentSummary = {
  id: string;
  merchantReference: string;
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  scenario: string;
  description: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
};

export type Transition = {
  id: string;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  reason: string | null;
  actorId: string | null;
  createdAt: string;
};

export type Transaction = {
  id: string;
  paymentId: string;
  transactionType: string;
  amountMinor: number;
  currency: string;
  status: string;
  reference: string;
  metadata: unknown;
  createdAt: string;
  payment?: { merchantReference: string; providerReference: string | null; status: PaymentStatus };
};

export type WebhookDelivery = {
  id: string;
  attemptNumber: number;
  status: string;
  responseCode: number | null;
  durationMs: number | null;
  errorSummary: string | null;
  attemptedAt: string;
  nextAttemptAt: string | null;
};

export type WebhookEvent = {
  id: string;
  providerEventId: string;
  eventType: string;
  paymentId: string | null;
  payload?: unknown;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  payment?: { merchantReference: string; status: string } | null;
  deliveries?: WebhookDelivery[];
};

export type PaymentDetail = PaymentSummary & {
  idempotencyKey: string | null;
  transitions: Transition[];
  transactions: Transaction[];
  webhookEvents: WebhookEvent[];
};

export type DashboardSummary = {
  from: string;
  to: string;
  currency: string | null;
  counts: {
    total: number;
    succeeded: number;
    failed: number;
    pending: number;
    processing: number;
    requiresReconciliation: number;
    successRate: number;
    failureRate: number;
  };
  volumeByCurrency: Array<{ currency: string; amountMinor: number; count: number }>;
  volumeByDay: Array<{ date: string; succeeded: number; failed: number; total: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  webhookFailures: number;
  openReconciliationItems: number;
  recentPayments: PaymentSummary[];
};

export type ReconciliationRun = {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  matchedCount: number;
  mismatchCount: number;
  unresolvedCount: number;
  summary: unknown;
  triggeredBy: { id: string; name: string; email: string } | null;
  items?: ReconciliationItem[];
};

export type ReconciliationItem = {
  id: string;
  runId: string;
  paymentId: string | null;
  mismatchType: string;
  status: string;
  internalValue: unknown;
  providerValue: unknown;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  payment: { merchantReference: string; status: string } | null;
  resolvedBy: { id: string; name: string } | null;
};

export type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: Role } | null;
};

export type HealthDetails = {
  service: string;
  environment?: string;
  sandbox: boolean;
  uptimeSeconds: number;
  status: string;
  database: string;
  redis: string;
  worker: { status: string; lastSeenAt: string | null };
  queue: { waiting: number; active: number; failed: number; delayed: number; completed: number } | null;
};
