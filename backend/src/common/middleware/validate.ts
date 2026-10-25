import type { NextFunction, Request, Response } from "express";
import type { ZodError, ZodType } from "zod";
import { AppError } from "../errors";

function details(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function parsePart<T>(schema: ZodType<T>, value: unknown, next: NextFunction): T | undefined {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(400, "VALIDATION_ERROR", "Request validation failed.", details(result.error)));
    return undefined;
  }
  return result.data;
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = parsePart(schema, req.body, next);
    if (parsed !== undefined) {
      res.locals.body = parsed;
      next();
    }
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = parsePart(schema, req.query, next);
    if (parsed !== undefined) {
      res.locals.query = parsed;
      next();
    }
  };
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = parsePart(schema, req.params, next);
    if (parsed !== undefined) {
      res.locals.params = parsed;
      next();
    }
  };
}
