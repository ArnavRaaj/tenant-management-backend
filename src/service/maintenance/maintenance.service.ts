import { Request } from "express";
import {
  createMaintenanceTicketRepo,
  findMaintenanceTicketsRepo,
  countMaintenanceTicketsRepo,
  findMaintenanceTicketByIdRepo,
  updateMaintenanceTicketRepo,
  aggregateMaintenanceStatsRepo,
} from "../../repository/maintenance.repository";
import { findTenantByIdRepo } from "../../repository/tenant.repository";
import { analyzeMaintenanceText } from "./aiClassifier.service";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { decryptTenantFields } from "../../utils/encryption";

/**
 * Creates a maintenance ticket (via Chatbot/WhatsApp or Admin dashboard)
 */
export const createTicketService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const { tenantId, description, photos, category, urgency, title } = req.body;

  if (!description || description.trim().length === 0) {
    throw new BadRequestError("Please describe the maintenance issue");
  }

  const tenant = await findTenantByIdRepo(tenantId, organizationId);
  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  const flat = tenant.flat as any;
  if (!flat) {
    throw new BadRequestError("Tenant is not currently assigned to a flat");
  }

  // AI Classification if not manually specified
  const aiResult = await analyzeMaintenanceText(description);

  const finalCategory = category || aiResult.category;
  const finalUrgency = urgency || aiResult.urgency;
  const finalTitle = title || aiResult.title;

  // Generate unique readable ticket number (e.g. TKT-202610-7B2F)
  const now = new Date();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const ticketNumber = `TKT-${now.getFullYear()}${monthStr}-${rand}`;

  const ticketData = {
    ticketNumber,
    tenant: tenant._id,
    flat: flat._id || flat,
    organizationId,
    category: finalCategory,
    urgency: finalUrgency,
    title: finalTitle,
    description: description.trim(),
    photos: photos || [],
    status: "OPEN",
  };

  const ticket = await createMaintenanceTicketRepo(ticketData);

  const flatNum = flat.flatNumber || "N/A";
  const decryptedTenant = decryptTenantFields(tenant);
  const cleanPhone = (decryptedTenant.contactNumber || "").replace(/\D/g, "");

  const tenantAcknowledgment = `🛠️ *Ticket #${ticketNumber} Registered*\n\nFlat: ${flatNum}\nCategory: ${finalCategory}\nPriority: ${finalUrgency}\nStatus: OPEN\n\n${aiResult.acknowledgmentMessage}`;

  return {
    success: true,
    ticket,
    tenantAcknowledgment,
    whatsappChatUrl: `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(tenantAcknowledgment)}`,
  };
};

/**
 * Get all tickets for organization with filters
 */
export const getTicketsService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const filter: any = { organizationId };

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.category) {
    filter.category = req.query.category;
  }
  if (req.query.urgency) {
    filter.urgency = req.query.urgency;
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const page = parseInt(req.query.page as string) || 1;
  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    findMaintenanceTicketsRepo(filter, { createdAt: -1 }, skip, limit),
    countMaintenanceTicketsRepo(filter),
  ]);

  const decryptedTickets = tickets.map((t: any) => {
    const obj = t.toObject ? t.toObject() : { ...t };
    if (obj.tenant) {
      obj.tenant = decryptTenantFields(obj.tenant);
    }
    return obj;
  });

  return {
    success: true,
    count: decryptedTickets.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: decryptedTickets,
  };
};

/**
 * Get single ticket details
 */
export const getTicketByIdService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const ticket = await findMaintenanceTicketByIdRepo(
    req.params.id as string,
    organizationId,
  );

  if (!ticket) {
    throw new NotFoundError("Maintenance ticket not found");
  }

  const obj = ticket.toObject ? ticket.toObject() : { ...ticket };
  if (obj.tenant) {
    obj.tenant = decryptTenantFields(obj.tenant);
  }

  return { success: true, data: obj };
};

/**
 * Update ticket status, resolution, and internal notes
 */
export const updateTicketStatusService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const { status, assignedVendorNotes, resolutionNotes } = req.body;

  const updatePayload: any = {};
  if (status) updatePayload.status = status;
  if (assignedVendorNotes !== undefined)
    updatePayload.assignedVendorNotes = assignedVendorNotes;
  if (resolutionNotes !== undefined)
    updatePayload.resolutionNotes = resolutionNotes;

  if (status === "RESOLVED") {
    updatePayload.resolvedAt = new Date();
  }

  const updated = await updateMaintenanceTicketRepo(
    req.params.id as string,
    organizationId,
    updatePayload,
  );

  if (!updated) {
    throw new NotFoundError("Maintenance ticket not found");
  }

  const obj = updated.toObject ? updated.toObject() : { ...updated };
  if (obj.tenant) {
    obj.tenant = decryptTenantFields(obj.tenant);
  }

  const tenantPhone = (obj.tenant?.contactNumber || "").replace(/\D/g, "");
  const tenantUpdateMsg = `🔔 *Update on Ticket #${obj.ticketNumber}*\n\nFlat: ${obj.flat?.flatNumber}\nIssue: ${obj.title}\nNew Status: *${obj.status}*\n${resolutionNotes ? `Notes: ${resolutionNotes}\n` : ""}Thank you for your patience!`;

  return {
    success: true,
    data: obj,
    tenantUpdateMsg,
    whatsappUpdateUrl: `https://wa.me/91${tenantPhone}?text=${encodeURIComponent(tenantUpdateMsg)}`,
  };
};

/**
 * Maintenance statistics for manager dashboard
 */
export const getMaintenanceStatsService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const stats = await aggregateMaintenanceStatsRepo(organizationId);
  return { success: true, data: stats };
};

