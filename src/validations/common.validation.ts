import Joi from "joi";

// Strict 24-character hex MongoDB ObjectId validation regex
export const objectIdSchema = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ID format: must be a 24-character hexadecimal ID",
    "string.empty": "ID is required",
    "any.required": "ID is required",
  });

export const idParamSchema = {
  params: Joi.object({
    id: objectIdSchema.required(),
  }),
};

export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});
