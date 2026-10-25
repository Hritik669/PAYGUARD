import type { Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler";
import { pageMeta, sendData } from "../../common/response";
import { AppError } from "../../common/errors";
import { getPrisma } from "../../infrastructure/prisma";
import * as transactions from "./service";
import type { TransactionListQuery } from "./validators";

export const transactionController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const query = res.locals.query as TransactionListQuery;
    const result = await transactions.listTransactions(query);
    sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
  }),
  detail: asyncHandler(async (_req: Request, res: Response) => {
    const { id } = res.locals.params as { id: string };
    sendData(res, await transactions.getTransaction(id));
  }),
  listForPayment: asyncHandler(async (_req: Request, res: Response) => {
    const { id } = res.locals.params as { id: string };
    const query = res.locals.query as TransactionListQuery;
    const payment = await getPrisma().payment.findUnique({ where: { id }, select: { id: true } });
    if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
    const result = await transactions.listTransactions({ ...query, paymentId: id });
    sendData(res, result.items, 200, pageMeta(query.page, query.pageSize, result.total));
  }),
};
