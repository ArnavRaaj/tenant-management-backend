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

export const sendOtpSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please include a valid email address",
      "any.required": "Email is required",
    }),
  }),
};

export const resendOtpSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please include a valid email address",
      "any.required": "Email is required",
    }),
  }),
};

export const verifyOtpSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please include a valid email address",
      "any.required": "Email is required",
    }),
    otp: Joi.string()
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        "string.pattern.base": "OTP must be exactly 6 digits",
        "any.required": "OTP is required",
      }),
  }),
};

export const resetPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please include a valid email address",
      "any.required": "Email is required",
    }),
    otp: Joi.string()
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        "string.pattern.base": "OTP must be exactly 6 digits",
        "any.required": "OTP is required",
      }),
    password: Joi.string().min(6).required().messages({
      "string.min": "Please enter a password with 6 or more characters",
      "any.required": "Password is required",
    }),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .messages({
        "any.only": "Confirm password must match password",
        "any.required": "Confirm password is required",
      }),
  }),
};
