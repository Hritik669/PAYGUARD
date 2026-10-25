import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { sendData } from "../../common/response";
import { healthDetails, readiness } from "./service";

export const live = (_req: Request, res: Response): void => {
  res.status(200).json({ data: { status: "live" }, meta: { requestId: _req.requestId } });
};

export const ready = asyncHandler(async (_req: Request, res: Response) => {
  const body = await readiness();
  res.status(body.status === "ready" ? 200 : 503).json({ data: body, meta: { requestId: _req.requestId } });
});

export const details = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await healthDetails());
});
