const mongoose = require("mongoose");

const MaintenanceTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.ObjectId,
      ref: "Tenant",
      required: true,
    },
    flat: {
      type: mongoose.Schema.ObjectId,
      ref: "Flat",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: ["PLUMBING", "ELECTRICAL", "CARPENTRY", "APPLIANCE", "CIVIL", "OTHER"],
      default: "OTHER",
    },
    urgency: {
      type: String,
      enum: ["EMERGENCY", "HIGH", "MEDIUM", "LOW"],
      default: "MEDIUM",
    },
    title: {
      type: String,
      required: [true, "Please add a ticket title"],
    },
    description: {
      type: String,
      required: [true, "Please describe the maintenance issue"],
    },
    photos: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
      default: "OPEN",
    },
    assignedVendorNotes: {
      type: String,
      default: "",
    },
    resolutionNotes: {
      type: String,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

MaintenanceTicketSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
MaintenanceTicketSchema.index({ tenant: 1, status: 1 });
MaintenanceTicketSchema.index({ flat: 1 });

module.exports = mongoose.model("MaintenanceTicket", MaintenanceTicketSchema);

