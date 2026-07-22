import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let statusCode = 500;
  let message = "Internal Server Error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.message;
  } else if (err.code === 11000) {
    statusCode = 400;
    message = "Duplicate field value entered";
  } else {
    // Optional: Log unexpected errors
    console.error("UNHANDLED ERROR:", err);
    if (err.message) {
      message = err.message;
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
