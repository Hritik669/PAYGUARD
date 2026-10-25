import { Prisma } from "@prisma/client";

export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function uniqueTargets(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(",");
  return typeof target === "string" ? target : "";
}
