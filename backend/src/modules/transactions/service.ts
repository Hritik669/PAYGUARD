import { Prisma, type TransactionStatus, type TransactionType } from "@prisma/client";
import { AppError } from "../../common/errors";
import { getPrisma } from "../../infrastructure/prisma";
import { presentTransaction } from "../payments/presenter";

const include = {
  payment: { select: { merchantReference: true, providerReference: true, status: true } },
} satisfies Prisma.TransactionInclude;

function buildWhere(query: {
  status?: TransactionStatus;
  transactionType?: TransactionType;
  currency?: string;
  q?: string;
  paymentId?: string;
}): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {};
  if (query.paymentId) where.paymentId = query.paymentId;
  if (query.status) where.status = query.status;
  if (query.transactionType) where.transactionType = query.transactionType;
  if (query.currency) where.currency = query.currency;
  if (query.q) {
    where.OR = [
      { reference: { contains: query.q, mode: "insensitive" } },
      { payment: { merchantReference: { contains: query.q, mode: "insensitive" } } },
      { payment: { providerReference: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function listTransactions(query: {
  page: number;
  pageSize: number;
  status?: TransactionStatus;
  transactionType?: TransactionType;
  currency?: string;
  q?: string;
  paymentId?: string;
}) {
  const where = buildWhere(query);
  const prisma = getPrisma();
  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, items: rows.map((row) => presentTransaction(row)) };
}

export async function getTransaction(id: string) {
  const row = await getPrisma().transaction.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, "TRANSACTION_NOT_FOUND", "Transaction not found.");
  return presentTransaction(row);
}
