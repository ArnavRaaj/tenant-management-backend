import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { config } from "../../config/env";
import {
  AppError,
  ErrorCode,
  TooManyRequestsError,
  isAppError,
} from "../errors/AppError";
import { HttpStatus } from "../http/httpStatus";
import { logger } from "../logger";

interface MongoServerErrorLike {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

/** Maps any thrown value to a safe AppError (no internals leak to clients). */
const normalise = (err: unknown): AppError => {
  if (isAppError(err)) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    return new AppError(
      "Validation failed",
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
      Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      })),
    );
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(
      `Invalid value for '${err.path}'`,
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_ERROR,
    );
  }
  const mongoErr = err as MongoServerErrorLike;
  if (mongoErr?.code === 11000) {
    const fields = Object.keys(mongoErr.keyPattern ?? {}).filter(
      (f) => f !== "organizationId",
    );
    return new AppError(
      `A record with the same ${fields.join(", ") || "value"} already exists`,
      HttpStatus.CONFLICT,
      ErrorCode.DUPLICATE_RESOURCE,
    );
  }
  if (err instanceof SyntaxError && "body" in (err as object)) {
    return new AppError(
      "Malformed JSON body",
      HttpStatus.BAD_REQUEST,
      ErrorCode.BAD_REQUEST,
    );
  }
  const status = (err as { status?: number; statusCode?: number })?.status;
  if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
    return new AppError(
      "Request body too large",
      HttpStatus.PAYLOAD_TOO_LARGE,
      ErrorCode.BAD_REQUEST,
    );
  }
  return new AppError("Internal server error");
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const appError = normalise(err);
  const isServerError = appError.statusCode >= 500;

  if (isServerError) {
    logger.error({ err, path: req.path, method: req.method }, "Request failed");
  } else {
    logger.debug(
      { code: appError.code, status: appError.statusCode, path: req.path },
      appError.message,
    );
  }

  if (appError instanceof TooManyRequestsError) {
    res.setHeader("Retry-After", String(appError.retryAfterSeconds));
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      ...(config.nodeEnv === "development" &&
      isServerError &&
      err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
    requestId: req.requestId,
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(HttpStatus.NOT_FOUND).json({
    success: false,
    error: {
      code: ErrorCode.ROUTE_NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
    requestId: req.requestId,
  });
};
