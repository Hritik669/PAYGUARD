import type { MismatchType, PaymentStatus } from "@prisma/client";

export type InternalPaymentView = {
  id: string;
  merchantReference: string;
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
};

export type ProviderStatementView = {
  providerReference: string;
  merchantReference: string;
  amountMinor: number;
  currency: string;
  status: string;
};

export type MismatchDraft = {
  paymentId: string | null;
  mismatchType: MismatchType;
  internalValue: Record<string, unknown> | null;
  providerValue: Record<string, unknown> | null;
};

const ELIGIBLE = new Set<PaymentStatus>(["SUCCEEDED", "FAILED", "REQUIRES_RECONCILIATION"]);

export function providerStatusMatches(internal: PaymentStatus, providerStatus: string): boolean {
  const normalized = providerStatus.trim().toLowerCase();
  if (internal === "SUCCEEDED") return normalized === "succeeded" || normalized === "captured";
  if (internal === "FAILED") return normalized === "failed" || normalized === "declined";
  if (internal === "PENDING" || internal === "PROCESSING") {
    return normalized === "pending" || normalized === "processing";
  }
  return normalized === "unknown" || normalized === "ambiguous";
}

function snapshotInternal(payment: InternalPaymentView): Record<string, unknown> {
  return {
    merchantReference: payment.merchantReference,
    providerReference: payment.providerReference,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    status: payment.status,
  };
}

function snapshotProvider(row: ProviderStatementView): Record<string, unknown> {
  return {
    merchantReference: row.merchantReference,
    providerReference: row.providerReference,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
  };
}

export function reconcileRecords(input: {
  internal: InternalPaymentView[];
  provider: ProviderStatementView[];
  duplicatePaymentIds: string[];
}): { mismatches: MismatchDraft[]; matchedCount: number } {
  const providerByMerchant = new Map<string, ProviderStatementView[]>();
  for (const row of input.provider) {
    const list = providerByMerchant.get(row.merchantReference) ?? [];
    list.push(row);
    providerByMerchant.set(row.merchantReference, list);
  }

  const matchedMerchants = new Set<string>();
  const mismatches: MismatchDraft[] = [];
  let matchedCount = 0;

  for (const payment of input.internal) {
    if (!ELIGIBLE.has(payment.status)) continue;
    const rows = providerByMerchant.get(payment.merchantReference) ?? [];
    if (rows.length === 0) {
      mismatches.push({
        paymentId: payment.id,
        mismatchType: "MISSING_PROVIDER_RECORD",
        internalValue: snapshotInternal(payment),
        providerValue: null,
      });
      continue;
    }
    const row = rows[0]!;
    matchedMerchants.add(payment.merchantReference);
    let mismatched = false;
    if (row.amountMinor !== payment.amountMinor || row.currency !== payment.currency) {
      mismatched = true;
      mismatches.push({
        paymentId: payment.id,
        mismatchType: "AMOUNT_MISMATCH",
        internalValue: snapshotInternal(payment),
        providerValue: snapshotProvider(row),
      });
    }
    if (!providerStatusMatches(payment.status, row.status)) {
      mismatched = true;
      mismatches.push({
        paymentId: payment.id,
        mismatchType: "STATUS_MISMATCH",
        internalValue: snapshotInternal(payment),
        providerValue: snapshotProvider(row),
      });
    }
    if (!mismatched) matchedCount += 1;
  }

  for (const row of input.provider) {
    const known = input.internal.some((payment) => payment.merchantReference === row.merchantReference);
    if (!known) {
      mismatches.push({
        paymentId: null,
        mismatchType: "MISSING_INTERNAL_RECORD",
        internalValue: null,
        providerValue: snapshotProvider(row),
      });
    }
  }

  const seenDuplicates = new Set<string>();
  for (const paymentId of input.duplicatePaymentIds) {
    if (seenDuplicates.has(paymentId)) continue;
    seenDuplicates.add(paymentId);
    const payment = input.internal.find((item) => item.id === paymentId);
    mismatches.push({
      paymentId,
      mismatchType: "DUPLICATE_PROVIDER_EVENT",
      internalValue: payment ? snapshotInternal(payment) : { paymentId },
      providerValue: null,
    });
  }

  return { mismatches, matchedCount };
}
