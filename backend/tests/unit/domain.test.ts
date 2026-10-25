import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors";
import { assertAmountMinor, assertCurrency } from "../../src/common/money";
import { canonicalJson, sha256 } from "../../src/common/hash";
import { hasPermission } from "../../src/modules/identity/permissions";
import { assertTransition, canTransition } from "../../src/modules/payments/state-machine";
import { isDeadLetter, nextRetryDelayMs } from "../../src/modules/webhooks/retry-policy";
import { reconcileRecords } from "../../src/modules/reconciliation/matcher";

describe("money validation", () => {
  it("accepts positive minor units and supported currencies", () => {
    expect(() => assertAmountMinor(100)).not.toThrow();
    expect(() => assertCurrency("USD")).not.toThrow();
  });

  it("rejects fractional, zero, and unknown currency values", () => {
    expect(() => assertAmountMinor(10.5)).toThrow(AppError);
    expect(() => assertAmountMinor(0)).toThrow(AppError);
    expect(() => assertCurrency("JPY")).toThrow(AppError);
  });
});

describe("idempotency request hash", () => {
  it("ignores object key order", () => {
    const left = sha256(canonicalJson({ b: 1, a: { d: 2, c: 3 } }));
    const right = sha256(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(left).toBe(right);
  });
});

describe("payment state machine", () => {
  it("allows pending payments to succeed, fail, or become unknown", () => {
    expect(canTransition("PENDING", "SUCCEEDED")).toBe(true);
    expect(canTransition("PENDING", "REQUIRES_RECONCILIATION")).toBe(true);
    expect(canTransition("PROCESSING", "FAILED")).toBe(true);
  });

  it("rejects changes to terminal payments", () => {
    expect(canTransition("SUCCEEDED", "FAILED")).toBe(false);
    expect(canTransition("FAILED", "SUCCEEDED")).toBe(false);
    expect(() => assertTransition("SUCCEEDED", "PENDING")).toThrow(AppError);
  });
});

describe("webhook retry policy", () => {
  it("uses bounded exponential backoff with jitter", () => {
    expect(nextRetryDelayMs(1, () => 0)).toBe(1000);
    expect(nextRetryDelayMs(3, () => 0)).toBe(4000);
    expect(nextRetryDelayMs(1, () => 1)).toBe(1200);
    expect(nextRetryDelayMs(12, () => 0)).toBe(5 * 60 * 1000);
  });

  it("dead-letters the fifth attempt", () => {
    expect(isDeadLetter(4)).toBe(false);
    expect(isDeadLetter(5)).toBe(true);
  });
});

describe("reconciliation matcher", () => {
  const internal = [
    { id: "p1", merchantReference: "m1", providerReference: "s1", amountMinor: 1000, currency: "USD", status: "SUCCEEDED" as const },
    { id: "p2", merchantReference: "m2", providerReference: "s2", amountMinor: 2000, currency: "USD", status: "SUCCEEDED" as const },
    { id: "p3", merchantReference: "m3", providerReference: "s3", amountMinor: 3000, currency: "EUR", status: "FAILED" as const },
    { id: "p4", merchantReference: "m4", providerReference: null, amountMinor: 4000, currency: "USD", status: "PENDING" as const },
  ];

  it("detects amount, status, missing, and duplicate mismatches", () => {
    const result = reconcileRecords({
      internal,
      provider: [
        { providerReference: "s1", merchantReference: "m1", amountMinor: 900, currency: "USD", status: "captured" },
        { providerReference: "s3", merchantReference: "m3", amountMinor: 3000, currency: "EUR", status: "captured" },
        { providerReference: "sx", merchantReference: "missing-internal", amountMinor: 500, currency: "USD", status: "captured" },
      ],
      duplicatePaymentIds: ["p1"],
    });
    const types = result.mismatches.map((item) => item.mismatchType).sort();
    expect(types).toEqual([
      "AMOUNT_MISMATCH",
      "DUPLICATE_PROVIDER_EVENT",
      "MISSING_INTERNAL_RECORD",
      "MISSING_PROVIDER_RECORD",
      "STATUS_MISMATCH",
    ]);
    expect(result.matchedCount).toBe(0);
  });
});

describe("authorization", () => {
  it("lets analysts read operations and blocks administrator actions", () => {
    expect(hasPermission("ANALYST", "payments:read")).toBe(true);
    expect(hasPermission("ANALYST", "payments:write")).toBe(false);
    expect(hasPermission("ANALYST", "audit:read")).toBe(false);
    expect(hasPermission("ADMIN", "reconciliation:resolve")).toBe(true);
    expect(hasPermission("ADMIN", "webhooks:replay")).toBe(true);
  });
});
