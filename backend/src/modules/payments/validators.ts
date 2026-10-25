import { z } from "zod";
import { currencySchema } from "../../common/money";
import { GATEWAY_SCENARIOS } from "./gateway";

export const createPaymentBodySchema = z.object({
  merchantReference: z
    .string()
    .trim()
    .min(4)
    .max(80)
    .regex(/^[A-Za-z0-9:_-]+$/, "Use letters, numbers, colon, underscore, or hyphen."),
  amountMinor: z.number().int().positive().max(100_000_000_00),
  currency: currencySchema,
  scenario: z.enum(GATEWAY_SCENARIOS),
  description: z.string().trim().min(1).max(280).optional(),
});

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "REQUIRES_RECONCILIATION"]).optional(),
  currency: currencySchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(["createdAt:desc", "createdAt:asc", "amountMinor:desc", "amountMinor:asc"]).default("createdAt:desc"),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const simulateBodySchema = z.object({
  outcome: z.enum(["success", "decline", "ambiguous"]),
  note: z.string().trim().min(3).max(280).optional(),
});

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, "Idempotency-Key must be 8-128 letters, numbers, underscores, or hyphens.");

export type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type SimulateBody = z.infer<typeof simulateBodySchema>;
