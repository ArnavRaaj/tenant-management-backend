import { HttpStatus, type HttpStatusCode } from "../http/httpStatus";

/**
 * Stable, machine-readable error codes returned to clients as `error.code`.
 * Clients branch on these, never on the human-readable message.
 */
export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  CONFLICT: "CONFLICT",
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",
  INVALID_OTP: "INVALID_OTP",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_ATTEMPTS_EXCEEDED: "OTP_ATTEMPTS_EXCEEDED",
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  message: string;
}

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCodeValue;
  public readonly details: ErrorDetail[] | undefined;
  public readonly isOperational = true;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCodeValue = ErrorCode.INTERNAL_ERROR,
    details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = "Bad request",
    code: ErrorCodeValue = ErrorCode.BAD_REQUEST,
  ) {
    super(message, HttpStatus.BAD_REQUEST, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: ErrorDetail[]) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = "Authentication required",
    code: ErrorCodeValue = ErrorCode.UNAUTHENTICATED,
  ) {
    super(message, HttpStatus.UNAUTHORIZED, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to perform this action",
    code: ErrorCodeValue = ErrorCode.FORBIDDEN,
  ) {
    super(message, HttpStatus.FORBIDDEN, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Resource state conflict",
    code: ErrorCodeValue = ErrorCode.CONFLICT,
  ) {
    super(message, HttpStatus.CONFLICT, code);
  }
}

/** Request is well-formed but violates a business rule. */
export class UnprocessableError extends AppError {
  constructor(
    message: string,
    code: ErrorCodeValue = ErrorCode.BUSINESS_RULE_VIOLATION,
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, code);
  }
}

export class TooManyRequestsError extends AppError {
  public readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message?: string) {
    super(
      message ??
        `Too many requests. Try again in ${retryAfterSeconds} second(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RATE_LIMITED,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A third-party dependency (Cloudinary, Surepass, Meta, SMTP) failed. */
export class UpstreamError extends AppError {
  constructor(message = "An upstream service failed. Please retry shortly.") {
    super(message, HttpStatus.BAD_GATEWAY, ErrorCode.UPSTREAM_ERROR);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SERVICE_UNAVAILABLE,
    );
  }
}

export const isAppError = (err: unknown): err is AppError =>
  err instanceof AppError;
