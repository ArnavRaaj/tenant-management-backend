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
    aadharImage: {
      type: String,
      default: "",
    },
    address: {
      type: String,
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
    dateOfRenting: {
      type: Date,
      default: Date.now,
    },
    flat: {
      type: mongoose.Schema.ObjectId,
      ref: "Flat",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

TenantSchema.index({ flat: 1, isActive: -1 });
TenantSchema.index({ isActive: 1 });

module.exports = mongoose.model("Tenant", TenantSchema);
