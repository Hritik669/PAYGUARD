import { Prisma, type IdempotencyStatus } from "@prisma/client";
import { AppError } from "../../common/errors";
import { canonicalJson, sha256 } from "../../common/hash";
import { isUniqueViolation } from "../../common/prisma-errors";
import { sleep } from "../../common/sleep";
import { getPrisma } from "../../infrastructure/prisma";

const STALE_MS = 30_000;
const TTL_MS = 24 * 60 * 60 * 1000;

type RecordRow = {
  id: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseCode: number | null;
  responseBody: Prisma.JsonValue | null;
  resourceId: string | null;
  version: number;
  expiresAt: Date;
  updatedAt: Date;
};

export type IdempotentResult = {
  statusCode: number;
  data: unknown;
  replayed: boolean;
};

async function findRecord(scope: string, userId: string, key: string): Promise<RecordRow | null> {
  return getPrisma().idempotencyRecord.findUnique({
    where: { scope_userId_key: { scope, userId, key } },
  });
}

function mismatch(): never {
  throw new AppError(
    409,
    "IDEMPOTENCY_PAYLOAD_MISMATCH",
    "This Idempotency-Key was already used with a different request payload.",
  );
}

function assertHash(record: RecordRow, requestHash: string): void {
  if (record.requestHash !== requestHash) mismatch();
}

async function claimExisting(record: RecordRow, requestHash: string): Promise<RecordRow | "busy" | "replay"> {
  assertHash(record, requestHash);
  if (record.status === "COMPLETED") {
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new AppError(409, "IDEMPOTENCY_KEY_EXPIRED", "This Idempotency-Key has expired. Start a new key.");
    }
    return "replay";
  }

  const stale = Date.now() - record.updatedAt.getTime() > STALE_MS;
  if (record.status === "IN_PROGRESS" && !stale) return "busy";

  const updated = await getPrisma().idempotencyRecord.updateMany({
    where: { id: record.id, status: record.status, version: record.version },
    data: { status: "IN_PROGRESS", version: { increment: 1 } },
  });
  if (updated.count !== 1) return "busy";
  const fresh = await getPrisma().idempotencyRecord.findUnique({ where: { id: record.id } });
  if (!fresh) throw new AppError(500, "IDEMPOTENCY_LOST", "The idempotency record disappeared.");
  return fresh;
}

export async function executeIdempotent(options: {
  scope: string;
  key: string;
  userId: string;
  requestBody: unknown;
  handler: (context: { recordId: string; resourceId: string | null }) => Promise<{
    statusCode: number;
    data: unknown;
    resourceId?: string;
  }>;
}): Promise<IdempotentResult> {
  const requestHash = sha256(canonicalJson(options.requestBody));
  const prisma = getPrisma();
  let owned: RecordRow | null = null;

  try {
    owned = await prisma.idempotencyRecord.create({
      data: {
        scope: options.scope,
        key: options.key,
        userId: options.userId,
        requestHash,
        status: "IN_PROGRESS",
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  if (!owned) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const existing = await findRecord(options.scope, options.userId, options.key);
      if (!existing) {
        await sleep(50);
        continue;
      }
      assertHash(existing, requestHash);
      if (existing.status === "COMPLETED" && existing.expiresAt.getTime() > Date.now()) {
        return { statusCode: existing.responseCode ?? 200, data: existing.responseBody, replayed: true };
      }
      const claimed = await claimExisting(existing, requestHash);
      if (claimed === "replay") {
        const again = await findRecord(options.scope, options.userId, options.key);
        return { statusCode: again?.responseCode ?? 200, data: again?.responseBody, replayed: true };
      }
      if (claimed !== "busy") {
        owned = claimed;
        break;
      }
      await sleep(100);
    }
  }

  if (!owned) {
    throw new AppError(
      409,
      "IDEMPOTENCY_IN_PROGRESS",
      "A request with this Idempotency-Key is still in progress.",
    );
  }

  try {
    const result = await options.handler({ recordId: owned.id, resourceId: owned.resourceId });
    await prisma.idempotencyRecord.update({
      where: { id: owned.id },
      data: {
        status: "COMPLETED",
        responseCode: result.statusCode,
        responseBody: result.data as Prisma.InputJsonValue,
        resourceId: result.resourceId ?? owned.resourceId,
      },
    });
    return { statusCode: result.statusCode, data: result.data, replayed: false };
  } catch (error) {
    await prisma.idempotencyRecord
      .update({ where: { id: owned.id }, data: { status: "FAILED" } })
      .catch(() => undefined);
    throw error;
  }
}

export async function attachIdempotencyResource(recordId: string, resourceId: string): Promise<void> {
  await getPrisma().idempotencyRecord.update({ where: { id: recordId }, data: { resourceId } });
}
