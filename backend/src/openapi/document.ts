export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "PayGuard API",
    version: "1.0.0",
    description:
      "Sandbox payment operations API. PayGuard simulates payment authorization, idempotency, webhooks, and reconciliation. It does not move money or accept real card data.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    { name: "Auth" },
    { name: "Payments" },
    { name: "Transactions" },
    { name: "Webhooks" },
    { name: "Merchant webhooks" },
    { name: "Exceptions" },
    { name: "Reconciliation" },
    { name: "Audit" },
    { name: "Dashboard" },
    { name: "Health" },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "payguard_access" },
      csrfHeader: { type: "apiKey", in: "header", name: "X-CSRF-Token" },
    },
    parameters: {
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 8, maxLength: 128 },
        description:
          "Required for payment creation. The same key and payload replay the original result for 24 hours. The same key with a different payload returns 409 IDEMPOTENCY_PAYLOAD_MISMATCH. A key still in progress returns 409 IDEMPOTENCY_IN_PROGRESS.",
      },
      Page: { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
      PageSize: { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
              requestId: { type: "string" },
            },
          },
        },
      },
      PaymentCreate: {
        type: "object",
        required: ["merchantReference", "amountMinor", "currency", "scenario"],
        properties: {
          merchantReference: { type: "string", example: "order_1001" },
          amountMinor: { type: "integer", example: 2599, description: "Minor units. 2599 USD is $25.99." },
          currency: { type: "string", enum: ["USD", "INR", "EUR", "GBP"] },
          scenario: {
            type: "string",
            enum: ["success", "decline", "gateway_failure", "timeout", "delayed_webhook"],
          },
          description: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an analyst account",
        description:
          "Self-service registration always creates an ANALYST. The role cannot be chosen. The response sets the same HttpOnly session cookies as login and does not return the password hash. Duplicate emails return 409 EMAIL_IN_USE.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 80, example: "Avery Chen" },
                  email: { type: "string", format: "email", example: "avery@payguard.local" },
                  password: { type: "string", minLength: 12, maxLength: 72 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Analyst created and signed in." },
          "400": { description: "VALIDATION_ERROR" },
          "409": { description: "EMAIL_IN_USE" },
          "429": { description: "RATE_LIMITED" },
          "503": { description: "RATE_LIMIT_UNAVAILABLE when Redis cannot enforce the limit." },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with email and password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              example: { email: "admin@payguard.local", password: "PayGuard-Admin-Demo-1" },
            },
          },
        },
        responses: {
          "200": { description: "Sets HttpOnly access and refresh cookies plus a readable CSRF cookie." },
          "401": { description: "INVALID_CREDENTIALS" },
          "429": { description: "RATE_LIMITED" },
          "503": { description: "RATE_LIMIT_UNAVAILABLE when Redis cannot enforce the login limit." },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate the refresh session",
        security: [{ cookieAuth: [], csrfHeader: [] }],
        responses: { "200": { description: "New access and refresh cookies." }, "401": { description: "Invalid or reused refresh token." } },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke the refresh session",
        security: [{ cookieAuth: [], csrfHeader: [] }],
        responses: { "200": { description: "Cookies cleared and refresh session revoked." } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Current user." }, "401": { description: "UNAUTHENTICATED" } },
      },
    },
    "/auth/csrf": {
      get: { tags: ["Auth"], responses: { "200": { description: "CSRF token for state-changing requests." } } },
    },
    "/payments": {
      post: {
        tags: ["Payments"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentCreate" } } } },
        responses: {
          "201": { description: "Payment reached a terminal sandbox state (succeeded or declined)." },
          "202": { description: "Payment is processing or requires reconciliation. A timeout is not a failure." },
          "409": { description: "Idempotency conflict, in-progress key, or invalid merchant reference." },
          "503": { description: "Simulated temporary gateway failure. The payment stays PENDING and the key can be retried." },
        },
      },
      get: {
        tags: ["Payments"],
        security: [{ cookieAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/PageSize" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "currency", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "sort", in: "query", schema: { type: "string", example: "createdAt:desc" } },
        ],
        responses: { "200": { description: "Paginated payments." } },
      },
    },
    "/payments/{id}": {
      get: {
        tags: ["Payments"],
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Payment detail, transitions, transactions, and webhooks." } },
      },
    },
    "/payments/{id}/simulate": {
      post: {
        tags: ["Payments"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description: "Admin-only sandbox operation. Invalid transitions are rejected. Repeating the current outcome is a no-op.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { example: { outcome: "success", note: "Operator confirmed the sandbox capture." } } },
        },
        responses: { "200": { description: "Updated payment." }, "409": { description: "INVALID_PAYMENT_TRANSITION" } },
      },
    },
    "/payments/{id}/transactions": {
      get: { tags: ["Transactions"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Transactions for one payment." } } },
    },
    "/transactions": {
      get: { tags: ["Transactions"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Paginated transactions." } } },
    },
    "/transactions/{id}": {
      get: { tags: ["Transactions"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Transaction detail." } } },
    },
    "/webhooks/sandbox/events": {
      post: {
        tags: ["Webhooks"],
        description:
          "Persist a simulated provider event before acknowledging it. Duplicate provider event ids return duplicate=true and do not create a second row. Signature is hex HMAC-SHA256 of the raw body using WEBHOOK_SANDBOX_SECRET.",
        parameters: [{ name: "X-Sandbox-Signature", in: "header", required: true, schema: { type: "string" } }],
        responses: { "202": { description: "Event stored and queued via the outbox." }, "401": { description: "INVALID_WEBHOOK_SIGNATURE" } },
      },
    },
    "/webhooks": {
      get: { tags: ["Webhooks"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Webhook events and deliveries." } } },
    },
    "/webhooks/{id}/replay": {
      post: {
        tags: ["Webhooks"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description: "Admin-only. Requeues a failed or dead-letter event. Processed events are rejected.",
        responses: { "200": { description: "Event reset to RECEIVED." }, "409": { description: "WEBHOOK_NOT_REPLAYABLE" } },
      },
    },
    "/reconciliation/runs": {
      post: {
        tags: ["Reconciliation"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description: "Admin-only. Compares internal payments with the sandbox provider statement and stores mismatches. Nothing is auto-resolved.",
        responses: { "201": { description: "Completed run." } },
      },
      get: { tags: ["Reconciliation"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Run history." } } },
    },
    "/reconciliation/runs/{id}": {
      get: { tags: ["Reconciliation"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Run plus items." } } },
    },
    "/reconciliation/items/{id}/resolve": {
      post: {
        tags: ["Reconciliation"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description: "Admin-only. Resolve or ignore an open item. Repeating the call is safe and does not change payment state.",
        responses: { "200": { description: "Item resolution." } },
      },
    },
    "/payments/{id}/refunds": {
      post: {
        tags: ["Payments"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        description: "Admin-only. Refund part or all of a succeeded capture. The refunded total cannot exceed the captured amount.",
        responses: { "200": { description: "Payment after the refund." }, "409": { description: "REFUND_EXCEEDS_CAPTURE or REFUND_NOT_ALLOWED" } },
      },
    },
    "/payments/{id}/void": {
      post: {
        tags: ["Payments"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        description: "Admin-only. Void a pending or processing payment before capture.",
        responses: { "200": { description: "Payment voided." }, "409": { description: "VOID_NOT_ALLOWED" } },
      },
    },
    "/exceptions": {
      get: { tags: ["Exceptions"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Unknown outcomes, open mismatches, and failed webhooks." } } },
    },
    "/merchant-webhooks": {
      get: { tags: ["Merchant webhooks"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Endpoints. Signing secrets are omitted." } } },
      post: {
        tags: ["Merchant webhooks"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description:
          "Admin-only. Registers an outbound endpoint. HTTP is allowed only for localhost. Private and link-local addresses are rejected. The signing secret is returned once and is not stored in the audit log.",
        responses: { "201": { description: "Endpoint created. The signing secret is returned once." }, "400": { description: "INVALID_ENDPOINT_URL or INVALID_EVENT_TYPE" } },
      },
    },
    "/merchant-webhooks/deliveries": {
      get: {
        tags: ["Merchant webhooks"],
        security: [{ cookieAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/Page" }, { $ref: "#/components/parameters/PageSize" }],
        responses: { "200": { description: "Delivery history with attempt records. Secrets are not included." } },
      },
    },
    "/merchant-webhooks/deliveries/{id}/replay": {
      post: {
        tags: ["Merchant webhooks"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description: "Admin-only. Requeues a failed or dead-letter merchant delivery.",
        responses: { "200": { description: "Delivery reset to PENDING." }, "409": { description: "DELIVERY_NOT_REPLAYABLE" } },
      },
    },
    "/merchant-webhooks/receipts": {
      get: { tags: ["Merchant webhooks"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Receipts recorded by the local sink." } } },
    },
    "/merchant-webhooks/sink": {
      post: {
        tags: ["Merchant webhooks"],
        description:
          "Local development sink. Verifies the HMAC signature and stores a receipt. This route does not use the session cookie.",
        parameters: [
          { name: "X-Payguard-Signature", in: "header", required: true, schema: { type: "string" } },
          { name: "X-Payguard-Endpoint", in: "header", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Receipt stored." }, "401": { description: "INVALID_SIGNATURE" } },
      },
    },
    "/exceptions/payments/{id}/decide": {
      post: {
        tags: ["Exceptions"],
        security: [{ cookieAuth: [], csrfHeader: [] }],
        description: "Admin-only. Records an operator decision for a payment in REQUIRES_RECONCILIATION.",
        responses: { "200": { description: "Decision stored." }, "409": { description: "EXCEPTION_NOT_OPEN" } },
      },
    },
    "/audit-logs": {
      get: { tags: ["Audit"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Admin-only audit history." }, "403": { description: "FORBIDDEN" } } },
    },
    "/dashboard/summary": {
      get: {
        tags: ["Dashboard"],
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "currency", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Operational summary. Amounts are never summed across currencies." } },
      },
    },
    "/health": {
      get: { tags: ["Health"], security: [{ cookieAuth: [] }], responses: { "200": { description: "Database, Redis, worker heartbeat, and queue depth. No secrets." } } },
    },
  },
} as const;
