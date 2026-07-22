import { Request, Response, NextFunction } from "express";
import Joi from "joi";

export const validateRequest = (schema: {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { body, query, params } = schema;

    if (body) {
      const { error } = body.validate(req.body, { abortEarly: false });
      if (error) {
        return res
          .status(400)
          .json({ message: error.details.map((x) => x.message).join(", ") });
      }
    }

    if (query) {
      const { error } = query.validate(req.query, { abortEarly: false });
      if (error) {
        return res
          .status(400)
          .json({ message: error.details.map((x) => x.message).join(", ") });
      }
    }

    if (params) {
      const { error } = params.validate(req.params, { abortEarly: false });
      if (error) {
        return res
          .status(400)
          .json({ message: error.details.map((x) => x.message).join(", ") });
      }
    }

    next();
  };
};
