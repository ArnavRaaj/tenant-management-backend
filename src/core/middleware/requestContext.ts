import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithContext } from "../requestContext";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Assigns a correlation id (honours a well-formed incoming X-Request-Id),
 * echoes it on the response and opens the AsyncLocalStorage scope used by
 * the logger and the audit trail.
 */
export const requestContext = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const incoming = req.get("x-request-id");
  const requestId =
    incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  runWithContext({ requestId }, () => next());
};
