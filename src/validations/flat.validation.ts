import Joi from "joi";
import { objectIdSchema } from "./common.validation";

export const getFlatsSchema = {
  query: Joi.object({
    status: Joi.string().valid("vacant", "occupied").optional(),
    buildingName: Joi.string().optional(),
    tag: Joi.string().optional(),
  }),
};

export const createFlatSchema = {
  body: Joi.object({
    flatNumber: Joi.string().required().messages({
      "any.required": "Flat number is required",
    }),
    floor: Joi.number().integer().min(0).max(50).required().messages({
      "number.base": "Floor must be a number",
      "number.min": "Floor cannot be negative",
      "number.max": "Floor number cannot exceed 50",
      "any.required": "Floor is required",
    }),
    buildingName: Joi.string().required().messages({
      "any.required": "Building/Apartment name is required",
    }),
    address: objectIdSchema.optional(),
  }),
};

export const flatIdParamSchema = {
  params: Joi.object({
    id: objectIdSchema.required(),
  }),
};
