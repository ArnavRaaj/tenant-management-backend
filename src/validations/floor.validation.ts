import Joi from "joi";

export const createFloorSchema = {
  body: Joi.object({
    floorNumber: Joi.number().integer().min(0).required().messages({
      "number.base": "Floor number must be an integer",
      "number.min": "Floor number cannot be negative",
      "any.required": "Floor number is required",
    }),
    name: Joi.string().required().trim().messages({
      "string.empty": "Floor name is required",
      "any.required": "Floor name is required",
    }),
    order: Joi.number().integer().optional(),
    isActive: Joi.boolean().optional(),
  }),
};
