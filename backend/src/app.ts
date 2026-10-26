import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { loadEnv } from "./config/env";
import { logger } from "./infrastructure/logger";
import { csrfProtection } from "./common/middleware/csrf";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler";
import { requestId } from "./common/middleware/request-id";
import { requestTimeout } from "./common/middleware/timeout";
import { auditRouter } from "./modules/audit/routes";
import { dashboardRouter } from "./modules/dashboard/routes";
import { exceptionRouter } from "./modules/exceptions/routes";
import { healthRouter } from "./modules/health/routes";
import { merchantWebhookRouter } from "./modules/merchant-webhooks/routes";
import { identityRouter } from "./modules/identity/routes";
import { paymentRouter } from "./modules/payments/routes";
import { reconciliationRouter } from "./modules/reconciliation/routes";
import { transactionRouter } from "./modules/transactions/routes";
import { webhookRouter } from "./modules/webhooks/routes";
import { openApiDocument } from "./openapi/document";

export function createApp() {
  const env = loadEnv();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(requestId);
  app.use(requestTimeout(30_000));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed"));
      },
      credentials: true,
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key", "X-Request-Id", "X-Sandbox-Signature"],
      exposedHeaders: ["X-Request-Id", "Idempotent-Replayed", "RateLimit-Limit", "RateLimit-Remaining", "Retry-After"],
    }),
  );
  app.use(
    express.json({
      limit: "256kb",
      verify: (req, _res, buffer) => {
        (req as express.Request).rawBody = buffer.toString("utf8");
      },
    }),
  );
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as express.Request).requestId,
        autoLogging: true,
        customProps: (req) => ({ requestId: (req as express.Request).requestId }),
        serializers: {
          req(req) {
            return { method: req.method, url: req.url };
          },
        },
      }),
    );
  }
  app.use(csrfProtection);

  app.use("/health", healthRouter);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "PayGuard API" }));
  app.get("/api/v1/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });

  const api = express.Router();
  api.use("/auth", identityRouter);
  api.use("/payments", paymentRouter);
  api.use("/transactions", transactionRouter);
  api.use("/webhooks", webhookRouter);
  api.use("/merchant-webhooks", merchantWebhookRouter);
  api.use("/exceptions", exceptionRouter);
  api.use("/reconciliation", reconciliationRouter);
  api.use("/audit-logs", auditRouter);
  api.use("/dashboard", dashboardRouter);
  api.use("/health", healthRouter);
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
