import { z } from "zod";

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  resourceType: z.string().trim().min(1).max(80).optional(),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
