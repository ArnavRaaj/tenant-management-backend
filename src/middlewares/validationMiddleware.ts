import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { AppError } from "../utils/AppError";
import { HttpStatus } from "../constants/httpStatus";

interface ValidationSchemaConfig {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

const setRequestProperty = (
  req: Request,
  prop: "params" | "query" | "body",
  value: any,
) => {
  Object.defineProperty(req, prop, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
};

export const validateRequest = (
  schema: ValidationSchemaConfig | Joi.ObjectSchema,
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    // If a direct Joi schema is passed, treat it as body validation
    const config: ValidationSchemaConfig =
      Joi.isSchema(schema) ? { body: schema as Joi.ObjectSchema } : schema;

    const { body, query, params } = config;

    if (params) {
      const { error, value } = params.validate(req.params, {
        abortEarly: false,
      });
      if (error) {
        const message = error.details.map((x) => x.message).join(", ");
        return next(new AppError(message, HttpStatus.BAD_REQUEST));
      }
      setRequestProperty(req, "params", value);
    }

    if (query) {
      const { error, value } = query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });
      if (error) {
        const message = error.details.map((x) => x.message).join(", ");
        return next(new AppError(message, HttpStatus.BAD_REQUEST));
      }
      setRequestProperty(req, "query", value);
    }

    if (body) {
      const { error, value } = body.validate(req.body, {
        abortEarly: false,
        allowUnknown: true, // Allow multipart fields like multer files
      });
      if (error) {
        const message = error.details.map((x) => x.message).join(", ");
        return next(new AppError(message, HttpStatus.BAD_REQUEST));
      }
      setRequestProperty(req, "body", value);
    }

    next();
  };
};
