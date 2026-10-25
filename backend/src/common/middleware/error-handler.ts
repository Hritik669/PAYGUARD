import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../../infrastructure/logger";
import { AppError } from "../errors";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}.`,
      requestId: req.requestId,
    },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        requestId,
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        error: {
          code: "UNIQUE_CONFLICT",
          message: "A unique constraint was violated.",
          requestId,
        },
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested record was not found.",
          requestId,
        },
      });
      return;
    }
  }

  if (err instanceof Error && err.message === "Origin not allowed") {
    res.status(403).json({
      error: { code: "CORS_FORBIDDEN", message: "Origin is not allowed.", requestId },
    });
    return;
  }

  logger.error({ err, requestId, method: req.method, path: req.path }, "unhandled request error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId,
    },
  });
}
