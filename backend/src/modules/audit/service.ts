import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../../infrastructure/prisma";

type Writer = Prisma.TransactionClient | PrismaClient;

export type AuditInput = {
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
};

export async function writeAudit(writer: Writer, input: AuditInput): Promise<void> {
  await writer.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      requestId: input.requestId ?? null,
    },
  });
}

export async function listAuditLogs(query: {
  page: number;
  pageSize: number;
  q?: string;
  action?: string;
  resourceType?: string;
}) {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.action) where.action = query.action;
  if (query.resourceType) where.resourceType = query.resourceType;
  if (query.q) {
    where.OR = [
      { action: { contains: query.q, mode: "insensitive" } },
      { resourceType: { contains: query.q, mode: "insensitive" } },
      { resourceId: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const prisma = getPrisma();
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor
        ? { id: row.actor.id, name: row.actor.name, email: row.actor.email, role: row.actor.role }
        : null,
    })),
  };
}
