import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { validateBody, validateParams } from "../../common/middleware/validate";
import { idParamSchema } from "../payments/validators";
import * as controller from "./controller";
import { decideBodySchema } from "./validators";

export const exceptionRouter = Router();

exceptionRouter.use(authenticate);
exceptionRouter.get("/", authorize("exceptions:read"), controller.list);
exceptionRouter.post("/payments/:id/decide", authorize("exceptions:resolve"), validateParams(idParamSchema), validateBody(decideBodySchema), controller.decide);
