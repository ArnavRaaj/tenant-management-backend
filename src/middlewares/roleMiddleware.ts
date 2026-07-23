import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export const requireSuperadmin = (
  req: any,
  res: Response,
  next: NextFunction,
) => {
  if (req.user && req.user.role === "superadmin") {
    next();
  } else {
    next(new AppError("Forbidden: Superadmin access required", 403));
  }
};
