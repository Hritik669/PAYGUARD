import type { Request, Response } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/async-handler";
import { pageMeta, sendData } from "../../common/response";
import * as webhooks from "./service";
import { sandboxEventSchema, type WebhookListQuery } from "./validators";

export const ingest = asyncHandler(async (req: Request, res: Response) => {
  const parsed = sandboxEventSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Webhook payload is invalid.", parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })));
  }
  const result = await webhooks.ingestSandboxEvent(req.rawBody ?? JSON.stringify(req.body), req.header("x-sandbox-signature"), parsed.data);
  sendData(res, result, 202);
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as WebhookListQuery;
  const result = await webhooks.listWebhookEvents(query);
  sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
});

export const detail = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  sendData(res, await webhooks.getWebhookEvent(id));
});

export const replay = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  const { id } = res.locals.params as { id: string };
  sendData(res, await webhooks.replayWebhookEvent(id, req.user.id, req.requestId));
});
