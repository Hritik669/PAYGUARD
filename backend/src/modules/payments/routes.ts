import { Router } from "express";
import { loadEnv } from "../../config/env";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { rateLimit } from "../../common/middleware/rate-limit";
import { validateBody, validateParams, validateQuery } from "../../common/middleware/validate";
import { transactionController } from "../transactions/controller";
import { transactionListQuerySchema } from "../transactions/validators";
import * as controller from "./controller";
import { createPaymentBodySchema, idParamSchema, paymentListQuerySchema, refundBodySchema, simulateBodySchema, voidBodySchema } from "./validators";

export const paymentRouter = Router();

paymentRouter.use(authenticate);

paymentRouter.post(
  "/",
  authorize("payments:write"),
  rateLimit({
    name: "payments-create",
    limit: loadEnv().PAYMENT_RATE_LIMIT_MAX,
    windowSeconds: loadEnv().PAYMENT_RATE_LIMIT_WINDOW_SECONDS,
    key: (req) => req.user?.id ?? req.ip ?? "unknown",
  }),
  validateBody(createPaymentBodySchema),
  controller.create,
);

paymentRouter.get("/", authorize("payments:read"), validateQuery(paymentListQuerySchema), controller.list);
paymentRouter.get("/:id", authorize("payments:read"), validateParams(idParamSchema), controller.detail);
paymentRouter.get(
  "/:id/transactions",
  authorize("transactions:read"),
  validateParams(idParamSchema),
  validateQuery(transactionListQuerySchema),
  transactionController.listForPayment,
);
paymentRouter.post(
  "/:id/refunds",
  authorize("payments:refund"),
  validateParams(idParamSchema),
  validateBody(refundBodySchema),
  controller.refund,
);
paymentRouter.post(
  "/:id/void",
  authorize("payments:refund"),
  validateParams(idParamSchema),
  validateBody(voidBodySchema),
  controller.voidPayment,
);
paymentRouter.post(
  "/:id/simulate",
  authorize("payments:simulate"),
  validateParams(idParamSchema),
  validateBody(simulateBodySchema),
  controller.simulate,
);
