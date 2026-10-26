import type { PaymentStatus } from "@prisma/client";
import { AppError } from "../../common/errors";

const REFUNDABLE: readonly PaymentStatus[] = ["SUCCEEDED", "PARTIALLY_REFUNDED"];
const VOIDABLE: readonly PaymentStatus[] = ["PENDING", "PROCESSING"];

export function refundedMinor(transactions: Array<{ transactionType: string; status: string; amountMinor: number }>): number {
  return transactions
    .filter((transaction) => transaction.transactionType === "REFUND" && transaction.status === "SUCCEEDED")
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
}

export function assertRefundable(status: PaymentStatus, capturedMinor: number, alreadyRefunded: number, requested: number): "PARTIALLY_REFUNDED" | "REFUNDED" {
  if (!REFUNDABLE.includes(status)) {
    throw new AppError(409, "REFUND_NOT_ALLOWED", "Only a succeeded or partially refunded payment can be refunded.");
  }
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new AppError(400, "INVALID_AMOUNT", "Refund amount must be a positive integer in minor units.");
  }
  const remaining = capturedMinor - alreadyRefunded;
  if (requested > remaining) {
    throw new AppError(409, "REFUND_EXCEEDS_CAPTURE", "The refund is larger than the amount still captured.");
  }
  return requested === remaining ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

export function assertVoidable(status: PaymentStatus): void {
  if (!VOIDABLE.includes(status)) {
    throw new AppError(409, "VOID_NOT_ALLOWED", "A void applies only before capture, while the payment is pending or processing.");
  }
}
