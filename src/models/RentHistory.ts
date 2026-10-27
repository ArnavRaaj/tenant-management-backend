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

RentHistorySchema.index({ organizationId: 1, paymentDate: -1 });
RentHistorySchema.index({ organizationId: 1, rentYear: -1, rentMonth: 1 });
RentHistorySchema.index({ tenant: 1, paymentDate: -1 });
RentHistorySchema.index({ flat: 1, paymentDate: -1 });

module.exports = mongoose.model("RentHistory", RentHistorySchema);
