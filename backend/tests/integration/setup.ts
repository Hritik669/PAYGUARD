import bcrypt from "bcryptjs";
import { beforeAll, beforeEach } from "vitest";
import { getPrisma } from "../../src/infrastructure/prisma";

export const adminCredentials = {
  email: "admin@payguard.test",
  password: "PayGuard-Test-Admin-1",
};

export const analystCredentials = {
  email: "analyst@payguard.test",
  password: "PayGuard-Test-Analyst-1",
};

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("payguard_test")) {
    throw new Error("Refusing to run integration tests outside payguard_test.");
  }
  const prisma = getPrisma();
  const adminHash = await bcrypt.hash(adminCredentials.password, 4);
  const analystHash = await bcrypt.hash(analystCredentials.password, 4);
  await prisma.user.upsert({
    where: { email: adminCredentials.email },
    update: { passwordHash: adminHash, role: "ADMIN", name: "Test Admin" },
    create: { email: adminCredentials.email, passwordHash: adminHash, role: "ADMIN", name: "Test Admin" },
  });
  await prisma.user.upsert({
    where: { email: analystCredentials.email },
    update: { passwordHash: analystHash, role: "ANALYST", name: "Test Analyst" },
    create: { email: analystCredentials.email, passwordHash: analystHash, role: "ANALYST", name: "Test Analyst" },
  });
});

beforeEach(async () => {
  await getPrisma().$executeRawUnsafe(`
    TRUNCATE TABLE
      webhook_deliveries,
      outbox_messages,
      webhook_events,
      transactions,
      payment_state_transitions,
      reconciliation_items,
      reconciliation_runs,
      audit_logs,
      idempotency_records,
      payments,
      provider_statements,
      refresh_sessions
    RESTART IDENTITY CASCADE
  `);
});
