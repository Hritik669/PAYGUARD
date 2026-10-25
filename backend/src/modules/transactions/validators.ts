import { z } from "zod";
import { currencySchema } from "../../common/money";

export const transactionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]).optional(),
  transactionType: z.enum(["AUTHORIZATION", "CAPTURE", "VOID", "REFUND", "ADJUSTMENT"]).optional(),
  currency: currencySchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
