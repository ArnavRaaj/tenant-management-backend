import mongoose, { Schema, type Types } from "mongoose";
import {
  TICKET_CATEGORIES,
  TICKET_URGENCIES,
  type TicketCategory,
  type TicketUrgency,
} from "./aiClassifier";

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_SOURCES = ["PORTAL", "WHATSAPP"] as const;

export interface TicketDoc {
  _id: Types.ObjectId;
  ticketNumber: string;
  tenant: Types.ObjectId;
  flat: Types.ObjectId;
  organizationId: Types.ObjectId;
  category: TicketCategory;
  urgency: TicketUrgency;
  title: string;
  description: string;
  photos: string[];
  status: TicketStatus;
  source: (typeof TICKET_SOURCES)[number];
  assignedVendorNotes: string;
  resolutionNotes: string;
  resolvedAt: Date | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TicketSchema = new Schema<TicketDoc>(
  {
    ticketNumber: { type: String, required: true },
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    flat: { type: Schema.Types.ObjectId, ref: "Flat", required: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: { type: String, enum: TICKET_CATEGORIES, default: "OTHER" },
    urgency: { type: String, enum: TICKET_URGENCIES, default: "MEDIUM" },
    title: { type: String, required: true, maxlength: 150 },
    description: { type: String, required: true, maxlength: 2000 },
    photos: { type: [String], default: [] },
    status: { type: String, enum: TICKET_STATUSES, default: "OPEN" },
    source: { type: String, enum: TICKET_SOURCES, default: "PORTAL" },
    assignedVendorNotes: { type: String, default: "", maxlength: 1000 },
    resolutionNotes: { type: String, default: "", maxlength: 1000 },
    resolvedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

TicketSchema.index({ organizationId: 1, ticketNumber: 1 }, { unique: true });
TicketSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
TicketSchema.index({ organizationId: 1, tenant: 1, createdAt: -1 });
TicketSchema.index({ organizationId: 1, createdAt: -1 });

export const MaintenanceTicket = mongoose.model<TicketDoc>(
  "MaintenanceTicket",
  TicketSchema,
);
