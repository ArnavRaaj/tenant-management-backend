import Joi from "joi";
import { PASSWORD_POLICY } from "../../core/security/password";

const email = Joi.string().trim().lowercase().email().max(254).required();
const otp = Joi.string()
  .pattern(/^\d{6}$/)
  .required()
  .messages({ "string.pattern.base": "OTP must be exactly 6 digits" });
const password = Joi.string().pattern(PASSWORD_POLICY).required().messages({
  "string.pattern.base":
    "Password must be 8-128 characters with an uppercase letter, a lowercase letter, a number and a special character",
});

export const registerSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email,
    password,
  }),
};

export const loginSchema = {
  body: Joi.object({
    email,
    password: Joi.string().max(128).required(),
  }),
};

export const emailOnlySchema = { body: Joi.object({ email }) };

export const verifyOtpSchema = { body: Joi.object({ email, otp }) };

export const resetPasswordSchema = {
  body: Joi.object({
    email,
    otp,
    password,
    confirmPassword: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .messages({ "any.only": "Confirm password must match password" }),
  }),
};
