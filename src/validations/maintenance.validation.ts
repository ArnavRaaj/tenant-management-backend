import Joi from "joi";
import { objectIdSchema as objectId } from "./common.validation";

export const getTicketsSchema = {
  query: Joi.object({
    status: Joi.string()
      .valid("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")
      .optional(),
    category: Joi.string()
      .valid(
        "PLUMBING",
        "ELECTRICAL",
        "CARPENTRY",
        "APPLIANCE",
        "CIVIL",
        "OTHER",
      )
      .optional(),
    urgency: Joi.string()
      .valid("EMERGENCY", "HIGH", "MEDIUM", "LOW")
      .optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
  }),
};

export const ticketIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const createTicketSchema = {
  body: Joi.object({
    tenantId: objectId.required(),
    description: Joi.string().required(),
    title: Joi.string().optional(),
    category: Joi.string()
      .valid(
        "PLUMBING",
        "ELECTRICAL",
        "CARPENTRY",
        "APPLIANCE",
        "CIVIL",
        "OTHER",
      )
      .optional(),
    urgency: Joi.string()
      .valid("EMERGENCY", "HIGH", "MEDIUM", "LOW")
      .optional(),
    photos: Joi.array().items(Joi.string()).optional(),
  }),
};

export const updateTicketStatusSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string()
      .valid("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")
      .optional(),
    assignedVendorNotes: Joi.string().allow("").optional(),
    resolutionNotes: Joi.string().allow("").optional(),
  }),
};

