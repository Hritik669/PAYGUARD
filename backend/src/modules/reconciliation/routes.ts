import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { rateLimit } from "../../common/middleware/rate-limit";
import { validateBody, validateParams, validateQuery } from "../../common/middleware/validate";
import { idParamSchema } from "../payments/validators";
import * as controller from "./controller";
import { resolveBodySchema, runListQuerySchema } from "./validators";

export const reconciliationRouter = Router();

reconciliationRouter.use(authenticate);
reconciliationRouter.post(
  "/runs",
  authorize("reconciliation:run"),
  rateLimit({
    name: "reconciliation-run",
    limit: 10,
    windowSeconds: 3600,
    key: (req) => req.user?.id ?? "unknown",
  }),
  controller.createRun,
);
reconciliationRouter.get("/runs", authorize("reconciliation:read"), validateQuery(runListQuerySchema), controller.listRuns);
reconciliationRouter.get("/runs/:id", authorize("reconciliation:read"), validateParams(idParamSchema), controller.getRun);
reconciliationRouter.post(
  "/items/:id/resolve",
  authorize("reconciliation:resolve"),
  validateParams(idParamSchema),
  validateBody(resolveBodySchema),
  controller.resolveItem,
);
