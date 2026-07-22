import { Request, Response, NextFunction } from "express";

export const responseMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.locals.data !== undefined) {
    const statusCode =
      res.locals.statusCode || (req.method === "POST" ? 201 : 200);
    return res.status(statusCode).json(res.locals.data);
  }
  next();
};
