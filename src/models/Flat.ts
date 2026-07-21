const mongoose = require("mongoose");

const FlatSchema = new mongoose.Schema(
  {
    flatNumber: {
      type: String,
      required: true,
      unique: true,
    },
    floor: {
      type: Number,
      required: true,
    },
    currentTenant: {
      type: mongoose.Schema.ObjectId,
      ref: "Tenant",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Flat", FlatSchema);
