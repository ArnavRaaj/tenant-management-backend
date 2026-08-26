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

// Same flat number can exist in different buildings, but not in the same building
FlatSchema.index({ flatNumber: 1, buildingName: 1 }, { unique: true });
FlatSchema.index({ currentTenant: 1 });

module.exports = mongoose.model("Flat", FlatSchema);

