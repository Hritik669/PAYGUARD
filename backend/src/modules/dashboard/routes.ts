import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { validateQuery } from "../../common/middleware/validate";
import * as controller from "./controller";
import { dashboardQuerySchema } from "./validators";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/summary",
  authenticate,
  authorize("dashboard:read"),
  validateQuery(dashboardQuerySchema),
  controller.summary,
);
