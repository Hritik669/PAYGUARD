import type { Response } from "express";

export function sendData(res: Response, data: unknown, status = 200, meta?: Record<string, unknown>): void {
  res.status(status).json({
    data,
    meta: {
      requestId: res.req.requestId,
      ...meta,
    },
  });
}

export function pageMeta(page: number, pageSize: number, total: number): Record<string, unknown> {
  return {
    page,
    pageSize,
    total,
    pageCount: Math.ceil(total / pageSize) || 0,
  };
}
