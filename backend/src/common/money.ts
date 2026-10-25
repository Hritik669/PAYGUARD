import { z } from "zod";
import { AppError } from "./errors";

export const SUPPORTED_CURRENCIES = ["USD", "INR", "EUR", "GBP"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const MAX_AMOUNT_MINOR = 100_000_000_00;

export const amountMinorSchema = z.number().int().positive().max(MAX_AMOUNT_MINOR);
export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export function assertAmountMinor(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) {
    throw new AppError(
      400,
      "INVALID_AMOUNT",
      "Amount must be a positive integer in minor currency units, up to 10000000000.",
    );
  }
}

export function assertCurrency(currency: string): asserts currency is SupportedCurrency {
  if (!SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency)) {
    throw new AppError(400, "INVALID_CURRENCY", "Currency must be one of USD, INR, EUR, or GBP.");
  }
}

export function minorToMajor(amountMinor: number): number {
  return amountMinor / 100;
}
