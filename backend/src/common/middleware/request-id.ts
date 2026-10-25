import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const id = incoming && /^[A-Za-z0-9_-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
