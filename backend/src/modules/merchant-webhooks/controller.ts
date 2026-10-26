import type { Request, Response } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/async-handler";
import { pageMeta, sendData } from "../../common/response";
import * as merchant from "./service";
import type { CreateEndpointBody } from "./validators";

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  sendData(res, await merchant.createEndpoint(res.locals.body as CreateEndpointBody, req.user.id, req.requestId), 201);
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await merchant.listEndpoints());
});

export const deliveries = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as { page: number; pageSize: number };
  const result = await merchant.listDeliveries(query.page, query.pageSize);
  sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
});

export const replay = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const { id } = res.locals.params as { id: string };
  sendData(res, await merchant.replayDelivery(id, req.user.id, req.requestId));
});

export const sink = asyncHandler(async (req: Request, res: Response) => {
  const endpointId = req.header("x-payguard-endpoint");
  if (!endpointId) throw new AppError(401, "INVALID_SIGNATURE", "The merchant webhook signature is invalid.");
  sendData(res, await merchant.acceptSink({
    endpointId,
    rawBody: req.rawBody ?? "",
    signature: req.header("x-payguard-signature"),
  }));
});

export const receipts = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await merchant.listReceipts());
});
