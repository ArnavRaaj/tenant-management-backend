import Joi from "joi";

export const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please include a valid email",
      "any.required": "Email is required",
    }),
    password: Joi.string().required().messages({
      "any.required": "Password is required",
    }),
  }),
};

export const registerSchema = {
  body: Joi.object({
    name: Joi.string().required().messages({
      "any.required": "Name is required",
    }),
    email: Joi.string().email().required().messages({
      "string.email": "Please include a valid email",
      "any.required": "Email is required",
    }),
    password: Joi.string().min(6).required().messages({
      "string.min": "Please enter a password with 6 or more characters",
      "any.required": "Password is required",
    }),
  }),
};
