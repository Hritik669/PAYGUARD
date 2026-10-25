import type { NextFunction, Request, Response } from "express";

export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          error: {
            code: "REQUEST_TIMEOUT",
            message: "The request timed out.",
            requestId: req.requestId,
          },
        });
      }
    }, ms);
    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}
