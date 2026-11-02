import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError";
import type { Permission } from "../security/permissions";

/**
 * RBAC guard: the caller's role must grant every listed permission.
 * Must run after `authenticate`.
 */
export const authorize =
  (...required: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new UnauthorizedError());
    const missing = required.filter((p) => !req.auth?.permissions.has(p));
    if (missing.length > 0) {
      return next(
        new ForbiddenError(
          `Your role (${req.auth.role}) is not permitted to perform this action`,
        ),
      );
    }
    next();
  };
