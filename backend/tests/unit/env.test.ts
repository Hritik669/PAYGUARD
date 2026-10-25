import { afterEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "../../src/config/env";

const baseline: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://example:example@localhost:5432/payguard",
  DIRECT_URL: "postgresql://example:example@localhost:5432/payguard",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "production-access-secret-32-characters",
  JWT_REFRESH_SECRET: "production-refresh-secret-32-characters",
  WEBHOOK_SANDBOX_SECRET: "production-webhook-secret-32-chars",
  CORS_ORIGINS: "https://payguard.example",
  COOKIE_SECURE: "true",
  COOKIE_SAMESITE: "none",
  TRUST_PROXY: "true",
};

const previous = new Map<string, string | undefined>();

function apply(overrides: Record<string, string> = {}): void {
  const next = { ...baseline, ...overrides };
  for (const [key, value] of Object.entries(next)) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  resetEnvForTests();
}

afterEach(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previous.clear();
  resetEnvForTests();
});

describe("production environment rules", () => {
  it("accepts cross-site cookies only when they are secure", () => {
    apply();
    expect(loadEnv().COOKIE_SAMESITE).toBe("none");
    expect(loadEnv().COOKIE_SECURE).toBe(true);
    expect(loadEnv().HOST).toBe("0.0.0.0");
  });

  it("rejects SameSite=None without the Secure attribute", () => {
    apply({ COOKIE_SECURE: "false" });
    expect(() => loadEnv()).toThrow(/COOKIE_SECURE/);
  });

  it("rejects a non-local http CORS origin in production", () => {
    apply({ CORS_ORIGINS: "http://demo.example" });
    expect(() => loadEnv()).toThrow(/https/);
  });
});
