import type { Request, Response } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/async-handler";
import { sendData } from "../../common/response";
import * as exceptions from "./service";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await exceptions.listExceptions());
});

export const decide = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const { id } = res.locals.params as { id: string };
  sendData(res, await exceptions.decideUnknownOutcome(id, req.user, res.locals.body as { outcome: "success" | "decline"; note: string }, req.requestId));
});
