const mongoose = require("mongoose");

const FlatSchema = new mongoose.Schema(
  {
    flatNumber: {
      type: String,
      required: true,
    },
    floor: {
      type: Number,
      required: true,
    },
    buildingName: {
      type: String,
      required: [true, "Please add a building/apartment name"],
    },
    currentTenant: {
      type: mongoose.Schema.ObjectId,
      ref: "Tenant",
      default: null,
    },
    address: {
      type: mongoose.Schema.ObjectId,
      ref: "Address",
      default: null,
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

// Multi-tenant unique index: Same flat number + building name is unique per organization
FlatSchema.index(
  { organizationId: 1, buildingName: 1, flatNumber: 1 },
  { unique: true },
);

// Query optimization indexes
FlatSchema.index({ organizationId: 1, currentTenant: 1 });
FlatSchema.index({ organizationId: 1, buildingName: 1 });

module.exports = mongoose.model("Flat", FlatSchema);
