import type { PaymentStatus } from "@prisma/client";
import { AppError } from "../../common/errors";

const ALLOWED: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["PROCESSING", "SUCCEEDED", "FAILED", "REQUIRES_RECONCILIATION", "VOIDED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "REQUIRES_RECONCILIATION", "VOIDED"],
  REQUIRES_RECONCILIATION: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  FAILED: [],
  VOIDED: [],
  REFUNDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      409,
      "INVALID_PAYMENT_TRANSITION",
      `Cannot transition a payment from ${from} to ${to}.`,
    );
  }
}

export function isTerminal(status: PaymentStatus): boolean {
  return status === "FAILED" || status === "VOIDED" || status === "REFUNDED";
}
