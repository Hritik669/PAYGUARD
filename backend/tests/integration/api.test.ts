import { createHmac } from "crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { disconnectPrisma, getPrisma } from "../../src/infrastructure/prisma";
import { disconnectRedis } from "../../src/infrastructure/redis";
import { closeQueues } from "../../src/infrastructure/queue";
import { processWebhookEvent } from "../../src/modules/webhooks/processor";
import { app, login } from "./helpers";
import { adminCredentials, analystCredentials } from "./setup";

describe("authentication", () => {
  it("logs in, reads the current user, and rejects analyst administrator actions", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    expect(admin.response.status).toBe(200);
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", admin.cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(adminCredentials.email);

    const missing = await request(app).get("/api/v1/payments");
    expect(missing.status).toBe(401);

    const analyst = await login(analystCredentials.email, analystCredentials.password);
    const forbidden = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", analyst.cookie)
      .set("X-CSRF-Token", analyst.csrf)
      .set("Idempotency-Key", "analyst-should-fail")
      .send({ merchantReference: "analyst_order", amountMinor: 1000, currency: "USD", scenario: "success" });
    expect(forbidden.status).toBe(403);

    const audit = await request(app).get("/api/v1/audit-logs").set("Cookie", analyst.cookie);
    expect(audit.status).toBe(403);
  });
});

describe("payments and idempotency", () => {
  it("creates a payment and replays the same idempotency key", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    const body = { merchantReference: `order_${Date.now()}`, amountMinor: 2599, currency: "USD", scenario: "success" };
    const first = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", "replay-key-12345")
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe("SUCCEEDED");

    const second = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", "replay-key-12345")
      .send(body);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.id).toBe(first.body.data.id);

    const mismatch = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", "replay-key-12345")
      .send({ ...body, amountMinor: 2600 });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const count = await getPrisma().payment.count({ where: { merchantReference: body.merchantReference } });
    expect(count).toBe(1);
  });

  it("does not create duplicate payments for concurrent identical requests", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    const body = { merchantReference: `concurrent_${Date.now()}`, amountMinor: 4200, currency: "INR", scenario: "success" };
    const key = "concurrent-key-123456";
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post("/api/v1/payments")
          .set("Cookie", admin.cookie)
          .set("X-CSRF-Token", admin.csrf)
          .set("Idempotency-Key", key)
          .send(body),
      ),
    );
    const successes = responses.filter((response) => response.status === 201);
    expect(successes.length).toBeGreaterThan(0);
    const ids = new Set(successes.map((response) => response.body.data.id));
    expect(ids.size).toBe(1);
    expect(responses.every((response) => [201, 409].includes(response.status))).toBe(true);
    const count = await getPrisma().payment.count({ where: { merchantReference: body.merchantReference } });
    expect(count).toBe(1);
  });

  it("keeps an ambiguous timeout out of the failed state and rejects a later invalid transition", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    const created = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", "timeout-key-123456")
      .send({ merchantReference: `timeout_${Date.now()}`, amountMinor: 1800, currency: "EUR", scenario: "timeout" });
    expect(created.status).toBe(202);
    expect(created.body.data.status).toBe("REQUIRES_RECONCILIATION");

    const succeeded = await request(app)
      .post(`/api/v1/payments/${created.body.data.id}/simulate`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .send({ outcome: "success", note: "Provider statement confirmed capture." });
    expect(succeeded.status).toBe(200);
    expect(succeeded.body.data.status).toBe("SUCCEEDED");

    const invalid = await request(app)
      .post(`/api/v1/payments/${created.body.data.id}/simulate`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .send({ outcome: "decline", note: "This transition is not allowed." });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe("INVALID_PAYMENT_TRANSITION");
  });
});

describe("webhooks, reconciliation, and constraints", () => {
  it("deduplicates provider events and retries a transient handler failure", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    const created = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", "webhook-payment-key")
      .send({ merchantReference: `hook_${Date.now()}`, amountMinor: 3300, currency: "USD", scenario: "delayed_webhook" });
    expect(created.status).toBe(202);
    const payload = {
      id: "evt_dedupe_test_001",
      type: "payment.succeeded",
      data: { paymentId: created.body.data.id, failTimes: 0 },
    };
    const raw = JSON.stringify(payload);
    const signature = createHmac("sha256", "test-webhook-secret").update(raw).digest("hex");
    const first = await request(app).post("/api/v1/webhooks/sandbox/events").set("X-Sandbox-Signature", signature).set("Content-Type", "application/json").send(raw);
    const second = await request(app).post("/api/v1/webhooks/sandbox/events").set("X-Sandbox-Signature", signature).set("Content-Type", "application/json").send(raw);
    expect(first.status).toBe(202);
    expect(second.body.data.duplicate).toBe(true);
    const stored = await getPrisma().webhookEvent.count({ where: { providerEventId: payload.id } });
    expect(stored).toBe(1);

    const flaky = await getPrisma().webhookEvent.create({
      data: {
        providerEventId: "evt_flaky_test",
        eventType: "payment.succeeded",
        paymentId: created.body.data.id,
        payload: { id: "evt_flaky_test", type: "payment.succeeded", data: { failTimes: 1 } },
        status: "RECEIVED",
        outbox: { create: { type: "payment.succeeded", payload: { id: "evt_flaky_test" } } },
      },
    });
    await processWebhookEvent(flaky.id);
    const afterFailure = await getPrisma().webhookEvent.findUniqueOrThrow({ where: { id: flaky.id } });
    expect(afterFailure.status).toBe("FAILED");
    await processWebhookEvent(flaky.id);
    const afterRetry = await getPrisma().webhookEvent.findUniqueOrThrow({
      where: { id: flaky.id },
      include: { deliveries: true },
    });
    expect(afterRetry.status).toBe("PROCESSED");
    expect(afterRetry.deliveries).toHaveLength(2);
    const payment = await getPrisma().payment.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(payment.status).toBe("SUCCEEDED");
  });

  it("persists reconciliation mismatches and enforces the amount check", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    const payment = await getPrisma().payment.create({
      data: {
        merchantReference: `recon_${Date.now()}`,
        amountMinor: 5000,
        currency: "USD",
        status: "SUCCEEDED",
        scenario: "success",
        providerReference: `sim_recon_${Date.now()}`,
      },
    });
    const run = await request(app)
      .post("/api/v1/reconciliation/runs")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf);
    expect(run.status).toBe(201);
    expect(run.body.data.mismatchCount).toBeGreaterThan(0);
    const saved = await getPrisma().reconciliationItem.findFirst({
      where: { runId: run.body.data.id, paymentId: payment.id, mismatchType: "MISSING_PROVIDER_RECORD" },
    });
    expect(saved).not.toBeNull();

    await expect(
      getPrisma().payment.create({
        data: {
          merchantReference: `negative_${Date.now()}`,
          amountMinor: -5,
          currency: "USD",
          status: "PENDING",
          scenario: "success",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("refunds, voids, and exceptions", () => {
  it("refunds up to the captured amount and voids only a pre-capture payment", async () => {
    const admin = await login(adminCredentials.email, adminCredentials.password);
    const stamp = Date.now();
    const created = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", `refund-create-${stamp}`)
      .send({ merchantReference: `refund_${stamp}`, amountMinor: 1000, currency: "USD", scenario: "success" });
    expect(created.status).toBe(201);

    const partial = await request(app)
      .post(`/api/v1/payments/${created.body.data.id}/refunds`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", `refund-partial-${stamp}`)
      .send({ amountMinor: 400, reason: "Partial sandbox refund." });
    expect(partial.status).toBe(200);
    expect(partial.body.data.status).toBe("PARTIALLY_REFUNDED");
    expect(partial.body.data.refundableAmountMinor).toBe(600);

    const tooMuch = await request(app)
      .post(`/api/v1/payments/${created.body.data.id}/refunds`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", `refund-too-much-${stamp}`)
      .send({ amountMinor: 700, reason: "This refund is too large." });
    expect(tooMuch.status).toBe(409);

    const pending = await request(app)
      .post("/api/v1/payments")
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", `void-create-${stamp}`)
      .send({ merchantReference: `void_${stamp}`, amountMinor: 500, currency: "USD", scenario: "delayed_webhook" });
    expect(pending.status).toBe(202);
    const voided = await request(app)
      .post(`/api/v1/payments/${pending.body.data.id}/void`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", `void-apply-${stamp}`)
      .send({ reason: "Customer cancelled before capture." });
    expect(voided.status).toBe(200);
    expect(voided.body.data.status).toBe("VOIDED");

    const capturedVoid = await request(app)
      .post(`/api/v1/payments/${created.body.data.id}/void`)
      .set("Cookie", admin.cookie)
      .set("X-CSRF-Token", admin.csrf)
      .set("Idempotency-Key", `void-captured-${stamp}`)
      .send({ reason: "Too late to void." });
    expect(capturedVoid.status).toBe(409);

    const exceptions = await request(app).get("/api/v1/exceptions").set("Cookie", admin.cookie);
    expect(exceptions.status).toBe(200);
    expect(Array.isArray(exceptions.body.data)).toBe(true);
  });
});

afterAll(async () => {
  await closeQueues().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
  await disconnectPrisma().catch(() => undefined);
});
