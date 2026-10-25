import type { Request, Response } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/async-handler";
import { pageMeta, sendData } from "../../common/response";
import { idempotencyKeySchema, type CreatePaymentBody, type PaymentListQuery, type SimulateBody } from "./validators";
import * as payments from "./service";

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const parsedKey = idempotencyKeySchema.safeParse(req.header("idempotency-key"));
  if (!parsedKey.success) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Send an Idempotency-Key header of 8 to 128 URL-safe characters.",
    );
  }
  const result = await payments.createPayment(req.user, res.locals.body as CreatePaymentBody, parsedKey.data, req.requestId);
  if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
  sendData(res, result.data, result.statusCode, { replayed: result.replayed });
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as PaymentListQuery;
  const result = await payments.getPaymentList(query);
  sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
});

export const detail = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  sendData(res, await payments.getPayment(id));
});

export const simulate = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const { id } = res.locals.params as { id: string };
  sendData(res, await payments.simulatePayment(id, req.user, res.locals.body as SimulateBody, req.requestId));
});
