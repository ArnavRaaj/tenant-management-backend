import Joi from "joi";

// Regex for MongoDB ObjectId
const objectId = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ID format",
  });

export const getFlatsSchema = {
  query: Joi.object({
    status: Joi.string().valid("vacant", "occupied").optional(),
  }),
};

export const createFlatSchema = {
  body: Joi.object({
    flatNumber: Joi.string().required().messages({
      "any.required": "Flat number is required",
    }),
    floor: Joi.number().required().messages({
      "any.required": "Floor must be a number",
    }),
  }),
};

export const flatIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
