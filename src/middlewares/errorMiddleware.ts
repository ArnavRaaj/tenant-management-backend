import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { HttpStatus } from "../constants/httpStatus";

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
  let message = "Internal Server Error";

  if (err instanceof AppError || (err.statusCode && err.isOperational)) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === "ValidationError") {
    // Mongoose or validation error
    statusCode = HttpStatus.BAD_REQUEST;
    message = err.message;
  } else if (err.name === "CastError") {
    // Malformed Mongoose ObjectId or type cast error
    statusCode = HttpStatus.BAD_REQUEST;
    message = `Invalid format for field '${err.path}': '${err.value}'`;
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = HttpStatus.CONFLICT;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate value entered for ${field}: already exists`;
  } else if (err.name === "JsonWebTokenError") {
    statusCode = HttpStatus.UNAUTHORIZED;
    message = "Invalid authentication token, access denied";
  } else if (err.name === "TokenExpiredError") {
    statusCode = HttpStatus.UNAUTHORIZED;
    message = "Authentication token has expired, please log in again";
  } else if (err.name === "MulterError") {
    statusCode = HttpStatus.BAD_REQUEST;
    message = err.message || "File upload error";
  } else {
    console.error("🔥 [UNHANDLED ERROR]:", err);
    if (err.message && process.env.NODE_ENV === "development") {
      message = err.message;
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
