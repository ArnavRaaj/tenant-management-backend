const mongoose = require("mongoose");

const WhatsAppMessageSchema = new mongoose.Schema(
  {
    direction: {
      type: String,
      enum: ["OUTBOUND", "INBOUND"],
      required: true,
      index: true,
    },
    senderPhone: {
      type: String,
      required: true,
      index: true,
    },
    recipientPhone: {
      type: String,
      required: true,
      index: true,
    },
    body: {
      type: String,
      required: true,
    },
    messageType: {
      type: String,
      enum: ["TEXT", "TEMPLATE", "MEDIA", "INTERACTIVE"],
      default: "TEXT",
    },
    templateName: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "RECEIVED"],
      default: "SENT",
      index: true,
    },
    provider: {
      type: String,
      enum: ["SIMULATOR", "META"],
      default: "SIMULATOR",
    },
    metaMessageId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
    tenant: {
      type: mongoose.Schema.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    context: {
      type: {
        type: String,
        enum: [
          "ONBOARDING",
          "RENT_RECEIPT",
          "RENT_REMINDER",
          "MAINTENANCE",
          "BOT_REPLY",
          "GENERAL",
        ],
        default: "GENERAL",
      },
      referenceId: {
        type: String,
        default: null,
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

WhatsAppMessageSchema.index({ createdAt: -1 });
WhatsAppMessageSchema.index({ organizationId: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ recipientPhone: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ senderPhone: 1, createdAt: -1 });

module.exports = mongoose.model("WhatsAppMessage", WhatsAppMessageSchema);

