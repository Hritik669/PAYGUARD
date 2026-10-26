import { z } from "zod";

export const decideBodySchema = z.object({
  outcome: z.enum(["success", "decline"]),
  note: z.string().trim().min(3).max(280),
});
