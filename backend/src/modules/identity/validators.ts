import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(180).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(72),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
