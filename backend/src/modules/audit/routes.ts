import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { validateQuery } from "../../common/middleware/validate";
import { auditQuerySchema } from "./validators";
import * as controller from "./controller";

export const auditRouter = Router();

auditRouter.get(
  "/",
  authenticate,
  authorize("audit:read"),
  validateQuery(auditQuerySchema),
  controller.list,
);
