import { Router } from "express";
import { authenticate } from "../../common/middleware/authenticate";
import { authorize } from "../../common/middleware/authorize";
import { validateParams, validateQuery } from "../../common/middleware/validate";
import { idParamSchema } from "../payments/validators";
import { transactionController } from "./controller";
import { transactionListQuerySchema } from "./validators";

export const transactionRouter = Router();

transactionRouter.use(authenticate);
transactionRouter.get("/", authorize("transactions:read"), validateQuery(transactionListQuerySchema), transactionController.list);
transactionRouter.get("/:id", authorize("transactions:read"), validateParams(idParamSchema), transactionController.detail);
