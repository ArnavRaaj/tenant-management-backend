import { Response, NextFunction } from "express";
import { ForbiddenError } from "../utils/AppError";

export const requireSuperadmin = (
  req: any,
  res: Response,
  next: NextFunction,
) => {
  if (req.user && req.user.role === "superadmin") {
    return next();
  }
  return next(new ForbiddenError("Forbidden: Superadmin access required"));
};

export const authorize = (...roles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError("Forbidden: Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Forbidden: Role '${req.user.role}' is not permitted to access this resource`,
        ),
      );
    }
    next();
  };
};
