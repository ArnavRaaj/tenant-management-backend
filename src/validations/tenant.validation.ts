import Joi from "joi";

const objectId = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .messages({
    "string.pattern.base": "Invalid ID format",
  });

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
    address: objectId.optional(),
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
    address: objectId.optional(),
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
    address: objectId.optional(),
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
  }),
};
