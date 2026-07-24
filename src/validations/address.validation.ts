import Joi from "joi";

export const createAddressSchema = {
  body: Joi.object({
    addressLine1: Joi.string().required().messages({
      "any.required": "Address line 1 is required",
    }),
    addressLine2: Joi.string().optional().allow(""),
    city: Joi.string().required().messages({
      "any.required": "City is required",
    }),
    postalCode: Joi.string()
      .pattern(/^\d{6}$/)
      .required()
      .messages({
        "string.pattern.base": "Postal code must be exactly 6 digits",
        "any.required": "Postal code is required",
      }),
    state: Joi.string().required().messages({
      "any.required": "State is required",
    }),
  }),
};

export const getAddressesSchema = {};
