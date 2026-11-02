import mongoose, { Schema, type Types } from "mongoose";
import { config } from "../../config/env";

export const MESSAGE_CONTEXTS = [
  "ONBOARDING",
  "RENT_RECEIPT",
  "RENT_REMINDER",
  "MAINTENANCE",
  "BOT_REPLY",
  "GENERAL",
] as const;
export type MessageContext = (typeof MESSAGE_CONTEXTS)[number];

export interface WhatsAppMessageDoc {
  _id: Types.ObjectId;
  direction: "OUTBOUND" | "INBOUND";
  senderPhone: string;
  recipientPhone: string;
  body: string;
  messageType: "TEXT" | "TEMPLATE" | "MEDIA" | "INTERACTIVE";
  status: "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "RECEIVED";
  provider: "SIMULATOR" | "META";
  metaMessageId: string | null;
  error: string | null;
  tenant: Types.ObjectId | null;
  organizationId: Types.ObjectId | null;
  context: { type: MessageContext; referenceId: string | null };
  createdAt: Date;
}

const WhatsAppMessageSchema = new Schema<WhatsAppMessageDoc>(
  {
    direction: { type: String, enum: ["OUTBOUND", "INBOUND"], required: true },
    senderPhone: { type: String, required: true },
    recipientPhone: { type: String, required: true },
    body: { type: String, required: true, maxlength: 4096 },
    messageType: {
      type: String,
      enum: ["TEXT", "TEMPLATE", "MEDIA", "INTERACTIVE"],
      default: "TEXT",
    },
    status: {
      type: String,
      enum: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "RECEIVED"],
      default: "SENT",
    },
    provider: {
      type: String,
      enum: ["SIMULATOR", "META"],
      default: "SIMULATOR",
    },
    metaMessageId: { type: String, default: null },
    error: { type: String, default: null },
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", default: null },
    organizationId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    context: {
      type: { type: String, enum: MESSAGE_CONTEXTS, default: "GENERAL" },
      referenceId: { type: String, default: null },
    },
  },
  { timestamps: true },
);

WhatsAppMessageSchema.index({ organizationId: 1, createdAt: -1 });
WhatsAppMessageSchema.index({
  organizationId: 1,
  recipientPhone: 1,
  createdAt: -1,
});
WhatsAppMessageSchema.index({
  organizationId: 1,
  senderPhone: 1,
  createdAt: -1,
});
WhatsAppMessageSchema.index(
  { metaMessageId: 1 },
  { partialFilterExpression: { metaMessageId: { $type: "string" } } },
);
WhatsAppMessageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: config.whatsappLogRetentionDays * 24 * 60 * 60 },
);

export const WhatsAppMessage = mongoose.model<WhatsAppMessageDoc>(
  "WhatsAppMessage",
  WhatsAppMessageSchema,
);
