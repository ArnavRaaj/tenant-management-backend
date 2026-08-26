const Joi = require("joi");

const passwordComplexity =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const inviteAdminSchema = Joi.object({
  name: Joi.string().required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  email: Joi.string().email({ tlds: false }).required().messages({
    "string.email": "Please provide a valid email",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
});

export const acceptInvitationSchema = Joi.object({
  email: Joi.string().email({ tlds: false }).required(),
  token: Joi.string().required(),
  password: Joi.string().pattern(passwordComplexity).required().messages({
    "string.pattern.base":
      "Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character",
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "any.required": "Confirm Password is required",
  }),
});
