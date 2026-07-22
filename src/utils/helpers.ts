import { Request, Response, NextFunction } from "express";
const jwt = require("jsonwebtoken");

const asyncHandler =
  (fn: any) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next))
      .then((data) => {
        if (data !== undefined && !res.headersSent) {
          res.locals.data = data;
          next();
        }
      })
      .catch(next);

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.TOKEN_EXPIRY,
  });
};

module.exports = { asyncHandler, generateToken };
