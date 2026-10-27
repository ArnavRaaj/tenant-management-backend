const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    // WHO
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null,
    },
    username: {
      type: String,
      default: "Anonymous",
    },
    email: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      default: "guest",
    },
    organizationId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null,
    },
    ip: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },

    // WHAT
    action: {
      type: String,
      required: true,
    },
    resource: {
      type: String,
      default: "general",
    },
    method: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    route: {
      type: String,
      default: "",
    },
    statusCode: {
      type: Number,
      default: 200,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // WHEN
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ createdAt: -1 });

const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
export default AuditLog;
