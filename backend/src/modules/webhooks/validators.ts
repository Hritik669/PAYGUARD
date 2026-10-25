import { z } from "zod";
import { currencySchema } from "../../common/money";

export const sandboxEventSchema = z.object({
  id: z.string().trim().min(4).max(120),
  type: z.enum(["payment.succeeded", "payment.failed"]),
  data: z.object({
    paymentId: z.string().uuid().optional(),
    providerReference: z.string().trim().min(4).max(120).optional(),
    merchantReference: z.string().trim().min(4).max(80).optional(),
    amountMinor: z.number().int().positive().optional(),
    currency: currencySchema.optional(),
    failTimes: z.number().int().min(0).max(10).optional(),
  }),
});

export const webhookListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["RECEIVED", "PROCESSING", "PROCESSED", "FAILED", "DEAD_LETTER"]).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export type SandboxEvent = z.infer<typeof sandboxEventSchema>;
export type WebhookListQuery = z.infer<typeof webhookListQuerySchema>;
