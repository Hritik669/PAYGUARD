import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { validateBody, validateParams, validateQuery } from "../../common/middleware/validate";
import { idParamSchema } from "../payments/validators";
import * as controller from "./controller";
import { createEndpointSchema, deliveryListQuerySchema } from "./validators";

export const merchantWebhookRouter = Router();

merchantWebhookRouter.post("/sink", controller.sink);
merchantWebhookRouter.use(authenticate);
merchantWebhookRouter.get("/", authorize("merchant-webhooks:read"), controller.list);
merchantWebhookRouter.post("/", authorize("merchant-webhooks:write"), validateBody(createEndpointSchema), controller.create);
merchantWebhookRouter.get("/deliveries", authorize("merchant-webhooks:read"), validateQuery(deliveryListQuerySchema), controller.deliveries);
merchantWebhookRouter.get("/receipts", authorize("merchant-webhooks:read"), controller.receipts);
merchantWebhookRouter.post("/deliveries/:id/replay", authorize("merchant-webhooks:replay"), validateParams(idParamSchema), controller.replay);
