const mongoose = require("mongoose");

const TenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    contactNumber: {
      type: String,
      required: [true, "Please add a contact number"],
    },
    age: {
      type: Number,
    },
    aadharNumber: {
      type: String,
    },
    gender: {
      type: String,
    },
    aadharImage: {
      type: String,
      default: "",
    },
    address: {
      addressLine1: { type: String, default: "" },
      addressLine2: { type: String, default: "" },
      city: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      state: { type: String, default: "" },
    },
    occupantsCount: {
      type: Number,
      default: 1,
    },
    securityDeposit: {
      type: Number,
      required: [true, "Please add security deposit amount"],
    },
    monthlyRent: {
      type: Number,
      required: [true, "Please add monthly rent amount"],
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    vacatedDate: {
      type: Date,
      default: null,
    },
    kycStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "FAILED"],
      default: "PENDING",
    },
    kycToken: {
      type: String,
      default: null,
      index: true,
    },
    kycTokenExpires: {
      type: Date,
      default: null,
    },
    kycVerifiedAt: {
      type: Date,
      default: null,
    },
    kycClientId: {
      type: String,
      default: null,
    },
    paymentPattern: {
      type: String,
      enum: ["NEW", "ON_TIME", "MID_MONTH", "CHRONIC_LATE"],
      default: "NEW",
    },
    lastPaidMonth: {
      type: String,
      default: null,
    },
    lastPaidYear: {
      type: Number,
      default: null,
    },
    dateOfRenting: {
      type: Date,
      default: Date.now,
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
  },
  {
    timestamps: true,
  },
);

TenantSchema.index({ organizationId: 1, isActive: 1, pendingBalance: 1 });
TenantSchema.index({ organizationId: 1, flat: 1 });
TenantSchema.index({ organizationId: 1, createdAt: -1 });
TenantSchema.index({ flat: 1, isActive: -1 });

module.exports = mongoose.model("Tenant", TenantSchema);
