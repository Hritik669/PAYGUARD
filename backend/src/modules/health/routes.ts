import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import * as controller from "./controller";

export const healthRouter = Router();

healthRouter.get("/live", controller.live);
healthRouter.get("/ready", controller.ready);
healthRouter.get("/", authenticate, authorize("health:read"), controller.details);
