import { z } from "zod";

const emailSchema = z.string().trim().email().max(180).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(72);

export const loginBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
});

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
