import type { NextFunction, Request, Response } from "express";
import type Joi from "joi";
import { ValidationError } from "../errors/AppError";

export interface RequestSchemas {
  params?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  body?: Joi.ObjectSchema;
}

const OPTIONS: Joi.ValidationOptions = {
  abortEarly: false,
  convert: true,
  // Unknown fields are dropped, never passed to services. This is what
  // prevents mass-assignment (e.g. a client setting `organizationId`).
  stripUnknown: true,
  errors: { wrap: { label: false } },
};

const assign = (
  req: Request,
  prop: "params" | "query" | "body",
  value: unknown,
) => {
  // Express 5 exposes req.query as a getter; redefine to store parsed values.
  Object.defineProperty(req, prop, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
};

/**
 * Validates and normalises params, query and body against Joi schemas.
 * Controllers can then trust the shapes (types are coerced, defaults applied).
 */
export const validate =
  (schemas: RequestSchemas) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const details: { field: string; message: string }[] = [];

    for (const prop of ["params", "query", "body"] as const) {
      const schema = schemas[prop];
      if (!schema) continue;
      const { value, error } = schema.validate(req[prop] ?? {}, OPTIONS);
      if (error) {
        details.push(
          ...error.details.map((d) => ({
            field: `${prop}.${d.path.join(".")}`,
            message: d.message,
          })),
        );
      } else {
        assign(req, prop, value);
      }
    }

    if (details.length > 0) {
      return next(
        new ValidationError(details.map((d) => d.message).join(", "), details),
      );
    }
    next();
  };
