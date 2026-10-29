import Joi from "joi";
import { objectIdSchema as objectId } from "./common.validation";

export const getTenantsSchema = {
  query: Joi.object({
    status: Joi.string().valid("active", "past").optional(),
    rentDue: Joi.string().valid("true", "false").optional(),
  }),
};

export const createTenantSchema = {
  body: Joi.object({
    name: Joi.string().required(),
    contactNumber: Joi.string().required(),
    age: Joi.number().optional(),
    aadharNumber: Joi.string()
      .pattern(/^\d{12}$/)
      .optional()
      .messages({
        "string.pattern.base": "Aadhar number must be exactly 12 digits",
      }),
    gender: Joi.string().valid("male", "female", "other").optional(),
    address: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
    occupantsCount: Joi.number().optional(),
    securityDeposit: Joi.number().required(),
    monthlyRent: Joi.number().required(),
    pendingBalance: Joi.number().optional(),
    flatId: objectId.required(),
    dateOfRenting: Joi.date().optional(),
  }).unknown(true), // allow aadharImage to be processed by multer
};

export const updateTenantSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: Joi.string().optional(),
    contactNumber: Joi.string().optional(),
    age: Joi.number().optional(),
    aadharNumber: Joi.string()
      .pattern(/^\d{12}$/)
      .optional()
      .messages({
        "string.pattern.base": "Aadhar number must be exactly 12 digits",
      }),
    gender: Joi.string().valid("male", "female", "other").optional(),
    address: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
    occupantsCount: Joi.number().optional(),
    securityDeposit: Joi.number().optional(),
    monthlyRent: Joi.number().optional(),
    pendingBalance: Joi.number().optional(),
    dateOfRenting: Joi.date().optional(),
  }).unknown(true),
};

export const changeTenantSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: Joi.string().required(),
    contactNumber: Joi.string().required(),
    age: Joi.number().optional(),
    aadharNumber: Joi.string()
      .pattern(/^\d{12}$/)
      .optional()
      .messages({
        "string.pattern.base": "Aadhar number must be exactly 12 digits",
      }),
    gender: Joi.string().valid("male", "female", "other").optional(),
    address: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
    occupantsCount: Joi.number().optional(),
    securityDeposit: Joi.number().required(),
    monthlyRent: Joi.number().required(),
    pendingBalance: Joi.number().optional(),
    dateOfRenting: Joi.date().optional(),
  }).unknown(true),
};

export const tenantIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const addRentRecordSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    amountPaid: Joi.number().required(),
    rentMonth: Joi.string().required(),
    rentYear: Joi.number().required(),
    paymentDate: Joi.date().optional(),
    paymentMode: Joi.string()
      .valid("CASH", "DIRECT_UPI", "BANK_TRANSFER", "CHEQUE", "ONLINE_LINK")
      .optional(),
    referenceId: Joi.string().allow("").optional(),
    notes: Joi.string().allow("").optional(),
  }),
};
