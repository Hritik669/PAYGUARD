import { z } from "zod";

export const resolveBodySchema = z.object({
  action: z.enum(["resolve", "ignore"]),
  note: z.string().trim().min(10).max(500),
});

export const runListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ResolveBody = z.infer<typeof resolveBodySchema>;
