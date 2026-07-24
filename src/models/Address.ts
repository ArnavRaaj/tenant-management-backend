const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    addressLine1: {
      type: String,
      required: [true, "Please add address line 1"],
    },
    addressLine2: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      required: [true, "Please add a city"],
    },
    postalCode: {
      type: String,
      required: [true, "Please add a postal code"],
    },
    state: {
      type: String,
      required: [true, "Please add a state"],
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

AddressSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Address", AddressSchema);
