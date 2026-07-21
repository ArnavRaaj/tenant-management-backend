const mongoose = require("mongoose");

const RentHistorySchema = new mongoose.Schema(
  {
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
    amountPaid: {
      type: Number,
      required: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    rentMonth: {
      type: String,
      required: true,
    },
    rentYear: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("RentHistory", RentHistorySchema);
