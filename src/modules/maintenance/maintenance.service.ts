import { Types } from "mongoose";
import { formatSequence, nextSequence } from "../../core/db/counter.model";
import { toObjectId } from "../../core/db/objectId";
import { pageMeta, toSkip, type PageQuery } from "../../core/db/pagination";
import { NotFoundError, UnprocessableError } from "../../core/errors/AppError";
import { recordAuditChange } from "../../core/requestContext";
import { decryptOrNull } from "../../core/security/crypto";
import { currentPeriod } from "../../core/utils/period";
import { normalizePhone } from "../../core/utils/text";
import type { AuthContext } from "../../types/express";
import type { TenantRecord } from "../tenants/tenant.mapper";
import { tenantRepository } from "../tenants/tenant.repository";
import {
  maintenanceUpdateMessage,
  maintenanceUpdateText,
  queueWhatsAppText,
} from "../whatsapp/whatsapp.service";
import {
  analyzeMaintenanceText,
  type TicketCategory,
  type TicketUrgency,
} from "./aiClassifier";
import {
  MaintenanceTicket,
  type TicketDoc,
  type TicketStatus,
} from "./ticket.model";

interface PopulatedTicket extends Omit<TicketDoc, "tenant" | "flat"> {
  tenant: {
    _id: Types.ObjectId;
    name: string;
    contactNumber: string;
    kycStatus: string;
  } | null;
  flat: {
    _id: Types.ObjectId;
    flatNumber: string;
    floor: number;
    buildingName: string;
  } | null;
}

const toTicketDto = (t: PopulatedTicket) => ({
  ...t,
  _id: t._id.toHexString(),
  tenant: t.tenant
    ? {
        _id: t.tenant._id.toHexString(),
        name: t.tenant.name,
        contactNumber: decryptOrNull(t.tenant.contactNumber),
        kycStatus: t.tenant.kycStatus,
      }
    : null,
});

const populate = <Q extends { populate: (path: string, select: string) => Q }>(
  q: Q,
) =>
  q
    .populate("tenant", "name contactNumber kycStatus")
    .populate("flat", "flatNumber floor buildingName");

const flatOf = (tenant: TenantRecord) => {
  if (!tenant.flat)
    throw new UnprocessableError("Tenant is not assigned to a flat");
  return tenant.flat instanceof Types.ObjectId
    ? { _id: tenant.flat, flatNumber: "N/A" }
    : tenant.flat;
};

/**
 * Single ticket-creation path for both the admin portal and WhatsApp, so
 * numbering, classification and validation can never diverge.
 */
export const createTicketForTenant = async (params: {
  tenant: TenantRecord;
  description: string;
  source: "PORTAL" | "WHATSAPP";
  createdBy: string | null;
  overrides?: {
    category?: TicketCategory;
    urgency?: TicketUrgency;
    title?: string;
  };
  photos?: string[];
}) => {
  const { tenant } = params;
  if (!tenant.isActive)
    throw new UnprocessableError("Tenant is no longer active");
  const flat = flatOf(tenant);
  const organizationId = tenant.organizationId.toHexString();

  const ai = await analyzeMaintenanceText(params.description);
  const period = currentPeriod();
  const seq = await nextSequence(`${organizationId}:ticket:${period}`);

  const ticket = await MaintenanceTicket.create({
    ticketNumber: formatSequence("TKT", period, seq),
    tenant: tenant._id,
    flat: flat._id,
    organizationId: tenant.organizationId,
    category: params.overrides?.category ?? ai.category,
    urgency: params.overrides?.urgency ?? ai.urgency,
    title: params.overrides?.title ?? ai.title,
    description: params.description.trim(),
    photos: params.photos ?? [],
    status: "OPEN",
    source: params.source,
    createdBy: params.createdBy ? toObjectId(params.createdBy) : null,
  });
  return {
    ticket: ticket.toObject(),
    analysis: ai,
    flatNumber: flat.flatNumber,
  };
};

export const createTicket = async (
  auth: AuthContext,
  input: {
    tenantId: string;
    description: string;
    title?: string;
    category?: TicketCategory;
    urgency?: TicketUrgency;
    photos?: string[];
  },
) => {
  const tenant = await tenantRepository.findById(
    input.tenantId,
    auth.organizationId,
  );
  if (!tenant) throw new NotFoundError("Tenant not found");

  const { ticket, analysis, flatNumber } = await createTicketForTenant({
    tenant,
    description: input.description,
    source: "PORTAL",
    createdBy: auth.userId,
    overrides: {
      ...(input.category ? { category: input.category } : {}),
      ...(input.urgency ? { urgency: input.urgency } : {}),
      ...(input.title ? { title: input.title } : {}),
    },
    ...(input.photos ? { photos: input.photos } : {}),
  });

  const phone = normalizePhone(decryptOrNull(tenant.contactNumber));
  const tenantAcknowledgment = `🛠️ *Ticket #${ticket.ticketNumber} Registered*\n\nFlat: ${flatNumber}\nCategory: ${ticket.category}\nPriority: ${ticket.urgency}\nStatus: OPEN\n\n${analysis.acknowledgmentMessage}`;
  recordAuditChange({
    resourceId: ticket._id.toHexString(),
    after: {
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      urgency: ticket.urgency,
    },
  });
  return {
    ticket: { ...ticket, _id: ticket._id.toHexString() },
    tenantAcknowledgment,
    whatsappChatUrl: phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(tenantAcknowledgment)}`
      : null,
  };
};

export const listTickets = async (
  auth: AuthContext,
  query: PageQuery & {
    status?: TicketStatus;
    category?: TicketCategory;
    urgency?: TicketUrgency;
  },
) => {
  const filter: Record<string, unknown> = {
    organizationId: toObjectId(auth.organizationId),
  };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.urgency) filter.urgency = query.urgency;

  const [items, total] = await Promise.all([
    populate(
      MaintenanceTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(toSkip(query))
        .limit(query.limit),
    ).lean<PopulatedTicket[]>(),
    MaintenanceTicket.countDocuments(filter),
  ]);
  return { items: items.map(toTicketDto), meta: pageMeta(query, total) };
};

export const getTicket = async (auth: AuthContext, id: string) => {
  const ticket = await populate(
    MaintenanceTicket.findOne({
      _id: toObjectId(id),
      organizationId: toObjectId(auth.organizationId),
    }),
  ).lean<PopulatedTicket>();
  if (!ticket) throw new NotFoundError("Maintenance ticket not found");
  return toTicketDto(ticket);
};

/** Updates status/notes and notifies the tenant on WhatsApp (queued). */
export const updateTicketStatus = async (
  auth: AuthContext,
  id: string,
  input: {
    status?: TicketStatus;
    assignedVendorNotes?: string;
    resolutionNotes?: string;
  },
) => {
  const org = toObjectId(auth.organizationId);
  const before = await MaintenanceTicket.findOne({
    _id: toObjectId(id),
    organizationId: org,
  }).lean();
  if (!before) throw new NotFoundError("Maintenance ticket not found");

  const set: Partial<TicketDoc> = {};
  if (input.status) set.status = input.status;
  if (input.assignedVendorNotes !== undefined)
    set.assignedVendorNotes = input.assignedVendorNotes;
  if (input.resolutionNotes !== undefined)
    set.resolutionNotes = input.resolutionNotes;
  if (input.status === "RESOLVED" && before.status !== "RESOLVED")
    set.resolvedAt = new Date();
  if (input.status && input.status !== "RESOLVED" && input.status !== "CLOSED")
    set.resolvedAt = null;

  const updated = await populate(
    MaintenanceTicket.findOneAndUpdate(
      { _id: before._id, organizationId: org },
      { $set: set },
      { returnDocument: "after", runValidators: true },
    ),
  ).lean<PopulatedTicket>();
  if (!updated) throw new NotFoundError("Maintenance ticket not found");

  const dto = toTicketDto(updated);
  const text = maintenanceUpdateText({
    tenantName: dto.tenant?.name ?? "Resident",
    ticketNumber: dto.ticketNumber,
    title: dto.title,
    flatNumber: dto.flat?.flatNumber ?? "N/A",
    status: dto.status,
    notes: input.resolutionNotes,
  });

  let notified = false;
  if (input.status && input.status !== before.status && dto.tenant) {
    const job = maintenanceUpdateMessage(
      {
        _id: dto.tenant._id,
        name: dto.tenant.name,
        contactNumber: dto.tenant.contactNumber,
      },
      auth.organizationId,
      text,
      dto.ticketNumber,
    );
    if (job) {
      await queueWhatsAppText(job);
      notified = true;
    }
  }

  recordAuditChange({
    resourceId: id,
    before: {
      status: before.status,
      assignedVendorNotes: before.assignedVendorNotes,
      resolutionNotes: before.resolutionNotes,
    },
    after: {
      status: updated.status,
      assignedVendorNotes: updated.assignedVendorNotes,
      resolutionNotes: updated.resolutionNotes,
    },
  });

  const phone = normalizePhone(dto.tenant?.contactNumber);
  return {
    ticket: dto,
    tenantNotified: notified,
    tenantUpdateMsg: text,
    whatsappUpdateUrl: phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
      : null,
  };
};

export const getStats = async (auth: AuthContext) => {
  const org = toObjectId(auth.organizationId);
  const [statusStats, categoryStats] = await Promise.all([
    MaintenanceTicket.aggregate<{ _id: string; count: number }>([
      { $match: { organizationId: org } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    MaintenanceTicket.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          organizationId: org,
          status: { $nin: ["RESOLVED", "CLOSED"] },
        },
      },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);
  return { statusStats, categoryStats };
};
