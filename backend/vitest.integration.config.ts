import { defineConfig } from "vitest/config";

const databaseUrl = "postgresql://payguard:payguard@localhost:5432/payguard_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    globalSetup: ["./tests/integration/global-setup.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: "4001",
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      REDIS_URL: "redis://127.0.0.1:6379",
      JWT_ACCESS_SECRET: "test-access-secret-with-32-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-with-32-characters",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      CORS_ORIGINS: "http://localhost:5173",
      COOKIE_SECURE: "false",
      WEBHOOK_SANDBOX_SECRET: "test-webhook-secret",
      BCRYPT_ROUNDS: "4",
      TRUST_PROXY: "false",
      LOGIN_RATE_LIMIT_MAX: "1000",
      LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
      PAYMENT_RATE_LIMIT_MAX: "1000",
      PAYMENT_RATE_LIMIT_WINDOW_SECONDS: "60",
    },
  },
});
