import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors";
import { hasPermission, type Permission } from "../../modules/identity/permissions";

export function authorize(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHENTICATED", "Authentication is required."));
      return;
    }
    if (!hasPermission(req.user.role, permission)) {
      next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
      return;
    }
    next();
  };
}
