import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors/AppError";

/**
 * NoSQL-injection guard: rejects request bodies containing MongoDB operator
 * keys (`$gt`, `$where`, ...) or dotted paths. Joi schemas already pin field
 * types; this is defence in depth for any route that forgets one.
 */
const MAX_DEPTH = 10;

const hasForbiddenKey = (value: unknown, depth = 0): boolean => {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((v) => hasForbiddenKey(v, depth + 1));
  }
  return Object.entries(value).some(
    ([key, v]) =>
      key.startsWith("$") || key.includes(".") || hasForbiddenKey(v, depth + 1),
  );
};

export const sanitizeInput = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (hasForbiddenKey(req.body) || hasForbiddenKey(req.params)) {
    return next(
      new BadRequestError(
        "Request contains forbidden characters in field names",
      ),
    );
  }
  next();
};
