import type { Request, Response } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/async-handler";
import { pageMeta, sendData } from "../../common/response";
import * as reconciliation from "./service";
import type { ResolveBody } from "./validators";

export const createRun = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  sendData(res, await reconciliation.runReconciliation(req.user.id, req.requestId), 201);
});

export const listRuns = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as { page: number; pageSize: number };
  const result = await reconciliation.listReconciliationRuns(query.page, query.pageSize);
  sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
});

export const getRun = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  sendData(res, await reconciliation.getReconciliationRun(id));
});

export const resolveItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const { id } = res.locals.params as { id: string };
  sendData(res, await reconciliation.resolveReconciliationItem(id, req.user.id, res.locals.body as ResolveBody, req.requestId));
});
