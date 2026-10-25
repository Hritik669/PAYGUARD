import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { pageMeta, sendData } from "../../common/response";
import { listAuditLogs } from "./service";
import type { AuditQuery } from "./validators";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as AuditQuery;
  const result = await listAuditLogs(query);
  sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
});
