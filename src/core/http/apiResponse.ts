import type { NextFunction, Request, RequestHandler, Response } from "express";
import { HttpStatus, type HttpStatusCode } from "./httpStatus";

/**
 * Standard API envelope.
 *
 *   success → { success: true,  data, meta?, requestId }
 *   failure → { success: false, error: { code, message, details? }, requestId }
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface CursorMeta {
  limit: number;
  nextCursor: string | null;
}

export type ResponseMeta =
  PaginationMeta | CursorMeta | Record<string, unknown>;

export interface HandlerResult<T = unknown> {
  readonly __handlerResult: true;
  statusCode: HttpStatusCode;
  data: T;
  meta?: ResponseMeta;
}

const result = <T>(
  statusCode: HttpStatusCode,
  data: T,
  meta?: ResponseMeta,
): HandlerResult<T> => ({
  __handlerResult: true,
  statusCode,
  data,
  ...(meta ? { meta } : {}),
});

export const ok = <T>(data: T, meta?: ResponseMeta) =>
  result(HttpStatus.OK, data, meta);
export const created = <T>(data: T) => result(HttpStatus.CREATED, data);
export const accepted = <T>(data: T) => result(HttpStatus.ACCEPTED, data);
export const noContent = () => result(HttpStatus.NO_CONTENT, null);

export type Controller = (
  req: Request,
  res: Response,
) => Promise<HandlerResult | void>;

/**
 * Wraps a controller: forwards rejections to the error middleware and hands
 * the returned result to `responseMiddleware` via `res.locals`.
 * Controllers that write the response themselves (webhooks) return void.
 */
export const handle =
  (controller: Controller): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    controller(req, res)
      .then((out) => {
        if (out && !res.headersSent) {
          res.locals.result = out;
          next();
        }
      })
      .catch(next);
  };

/** Post-route middleware: serialises `res.locals.result` into the envelope. */
export const responseMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const out = res.locals.result as HandlerResult | undefined;
  if (!out) return next();

  if (out.statusCode === HttpStatus.NO_CONTENT) {
    return res.status(HttpStatus.NO_CONTENT).end();
  }
  return res.status(out.statusCode).json({
    success: true,
    data: out.data,
    ...(out.meta ? { meta: out.meta } : {}),
    requestId: req.requestId,
  });
};
