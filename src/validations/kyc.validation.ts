import Joi from "joi";

export const getKycInfoSchema = {
  params: Joi.object({
    token: Joi.string().hex().min(32).max(64).required(),
  }),
};

export const generateKycOtpSchema = {
  body: Joi.object({
    token: Joi.string().hex().min(32).max(64).required(),
    aadharNumber: Joi.string()
      .pattern(/^\d{12}$/)
      .required()
      .messages({
        "string.pattern.base": "Aadhaar number must be exactly 12 digits",
      }),
  }),
};

export const submitKycOtpSchema = {
  body: Joi.object({
    token: Joi.string().hex().min(32).max(64).required(),
    otp: Joi.string()
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        "string.pattern.base": "OTP must be exactly 6 digits",
      }),
    clientId: Joi.string().optional(),
  }),
};

