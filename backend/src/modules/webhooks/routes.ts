import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { rateLimit } from "../../common/middleware/rate-limit";
import { validateParams, validateQuery } from "../../common/middleware/validate";
import { idParamSchema } from "../payments/validators";
import * as controller from "./controller";
import { webhookListQuerySchema } from "./validators";

export const webhookRouter = Router();

webhookRouter.post(
  "/sandbox/events",
  rateLimit({
    name: "webhook-ingest",
    limit: 120,
    windowSeconds: 60,
    key: (req) => req.ip ?? "unknown",
  }),
  controller.ingest,
);

webhookRouter.get("/", authenticate, authorize("webhooks:read"), validateQuery(webhookListQuerySchema), controller.list);
webhookRouter.get("/:id", authenticate, authorize("webhooks:read"), validateParams(idParamSchema), controller.detail);
webhookRouter.post("/:id/replay", authenticate, authorize("webhooks:replay"), validateParams(idParamSchema), controller.replay);
