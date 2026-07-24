const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    timestamp: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
