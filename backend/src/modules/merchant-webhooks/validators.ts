import { z } from "zod";

export const createEndpointSchema = z.object({
  url: z.string().trim().min(8).max(300),
  description: z.string().trim().min(3).max(160),
  eventTypes: z.array(z.string().min(3).max(64)).min(1).max(8),
});

export const deliveryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateEndpointBody = z.infer<typeof createEndpointSchema>;
