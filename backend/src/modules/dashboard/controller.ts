import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { sendData } from "../../common/response";
import { getDashboardSummary } from "./service";
import type { DashboardQuery } from "./validators";

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as DashboardQuery;
  sendData(res, await getDashboardSummary(query));
});
