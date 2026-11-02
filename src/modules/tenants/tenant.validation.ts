import Joi from "joi";
import { pageQuerySchema } from "../../core/db/pagination";
import { MONTH_NAMES } from "../../core/utils/period";
import { MASKED_AADHAAR_PATTERN } from "../../core/utils/text";
import { PAYMENT_MODES } from "./rent.model";
import { GENDERS } from "./tenant.model";

export const objectId = Joi.string().hex().length(24);
export const idParams = Joi.object({ id: objectId.required() });

// Multipart forms send every field as a string and "" for blank inputs:
// `.empty("")` turns blanks into "not provided" instead of a type error.
const money = Joi.number().min(0).max(100_000_000).precision(2);

const contactNumber = Joi.string()
  .trim()
  .custom((value: string, helpers) => {
    const digits = value.replace(/\D/g, "");
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    if (
      !/^[6-9]\d{9}$/.test(local) ||
      (digits.length > 10 && !/^(91|0)/.test(digits))
    ) {
      return helpers.error("string.pattern.base");
    }
    return local;
  })
  .messages({
    "string.pattern.base":
      "Contact number must be a valid 10-digit Indian mobile number",
  });

const aadharNumber = Joi.alternatives()
  .try(
    Joi.string().trim().pattern(MASKED_AADHAAR_PATTERN),
    Joi.string()
      .trim()
      .custom((value: string, helpers) => {
        const digits = value.replace(/\s|-/g, "");
        return /^[2-9]\d{11}$/.test(digits)
          ? digits
          : helpers.error("any.invalid");
      }),
  )
  .messages({
    "alternatives.match": "Aadhaar number must be exactly 12 digits",
  });

const addressObject = Joi.object({
  addressLine1: Joi.string().trim().max(200).allow(""),
  addressLine2: Joi.string().trim().max(200).allow(""),
  city: Joi.string().trim().max(100).allow(""),
  postalCode: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .allow("")
    .messages({
      "string.pattern.base": "Postal code must be exactly 6 digits",
    }),
  state: Joi.string().trim().max(100).allow(""),
});

/** Accepts an address object or (multipart) a JSON string of one. */
const address = Joi.alternatives().try(
  addressObject,
  Joi.string().custom((value: string, helpers) => {
    try {
      const parsed: unknown = JSON.parse(value);
      const { value: obj, error } = addressObject.validate(parsed, {
        stripUnknown: true,
      });
      return error ? helpers.error("any.invalid") : obj;
    } catch {
      return helpers.error("any.invalid");
    }
  }),
);

const tenantFields = {
  name: Joi.string().trim().min(2).max(100),
  contactNumber,
  age: Joi.number().integer().min(0).max(150).empty(""),
  aadharNumber: aadharNumber.empty(""),
  gender: Joi.string()
    .trim()
    .lowercase()
    .valid(...GENDERS)
    .empty(""),
  address: address.empty(""),
  occupantsCount: Joi.number().integer().min(1).max(50).empty(""),
  securityDeposit: money,
  monthlyRent: money,
  pendingBalance: money.min(-100_000_000).empty(""),
  dateOfRenting: Joi.date().iso().max("now").empty(""),
};

const requiredTenant = {
  ...tenantFields,
  name: tenantFields.name.required(),
  contactNumber: tenantFields.contactNumber.required(),
  securityDeposit: tenantFields.securityDeposit.required(),
  monthlyRent: tenantFields.monthlyRent.required(),
};

export const tenantSchemas = {
  list: {
    query: Joi.object({
      ...pageQuerySchema,
      status: Joi.string().valid("active", "past").default("active"),
      rentDue: Joi.boolean().truthy("true").falsy("false").default(false),
    }),
  },
  idOnly: { params: idParams },
  create: {
    body: Joi.object({ ...requiredTenant, flatId: objectId.required() }),
  },
  update: {
    params: idParams,
    body: Joi.object({
      ...tenantFields,
      securityDeposit: money.empty(""),
      monthlyRent: money.empty(""),
      contactNumber: contactNumber.empty(""),
      name: tenantFields.name.empty(""),
    }),
  },
  change: { params: idParams, body: Joi.object(requiredTenant) },
  rentHistory: { params: idParams, query: Joi.object(pageQuerySchema) },
  recordRent: {
    params: idParams,
    body: Joi.object({
      amountPaid: money.greater(0).required(),
      rentMonth: Joi.string()
        .valid(...MONTH_NAMES)
        .insensitive()
        .required(),
      rentYear: Joi.number().integer().min(2000).max(2100).required(),
      paymentDate: Joi.date().iso().max("now").optional(),
      paymentMode: Joi.string()
        .valid(...PAYMENT_MODES)
        .default("CASH"),
      referenceId: Joi.string().trim().max(100).allow("").optional(),
      notes: Joi.string().trim().max(500).allow("").optional(),
    }),
  },
};

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;
