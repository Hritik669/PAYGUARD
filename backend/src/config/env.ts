import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  WEBHOOK_SANDBOX_SECRET: z.string().min(8),
  LOG_LEVEL: z.string().default("info"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  PAYMENT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  PAYMENT_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
});

export type Env = Omit<z.infer<typeof schema>, "COOKIE_SECURE" | "TRUST_PROXY" | "CORS_ORIGINS"> & {
  COOKIE_SECURE: boolean;
  TRUST_PROXY: boolean;
  CORS_ORIGINS: string[];
};

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === "production") {
    const unsafe = [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET, value.WEBHOOK_SANDBOX_SECRET];
    if (unsafe.some((secret) => secret.includes("change-me") || secret.includes("local-demo") || secret.length < 24)) {
      throw new Error("Refusing to start with local demo secrets in production.");
    }
  }
  cached = {
    ...value,
    COOKIE_SECURE: value.COOKIE_SECURE === "true",
    TRUST_PROXY: value.TRUST_PROXY === "true",
    CORS_ORIGINS: value.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  };
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}
