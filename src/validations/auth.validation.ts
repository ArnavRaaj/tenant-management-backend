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
    password: Joi.string()
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      )
      .required()
      .messages({
        "string.pattern.base":
          "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character",
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

export const verifyEmailSchema = {
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
    password: Joi.string()
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      )
      .required()
      .messages({
        "string.pattern.base":
          "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character",
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
