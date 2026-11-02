import mongoose, { Schema, type Types } from "mongoose";

export const PAYMENT_MODES = [
  "CASH",
  "DIRECT_UPI",
  "BANK_TRANSFER",
  "CHEQUE",
  "ONLINE_LINK",
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface RentHistoryDoc {
  _id: Types.ObjectId;
  tenant: Types.ObjectId;
  flat: Types.ObjectId;
  /** Denormalised at write time so dashboards avoid a $lookup per payment. */
  floor: number;
  /** Integer paise */
  amountPaid: number;
  paymentDate: Date;
  /** YYYYMM */
  period: number;
  rentMonth: number;
  rentYear: number;
  paymentMode: PaymentMode;
  receiptNumber: string;
  referenceId: string;
  notes: string;
  idempotencyKey: string | null;
  recordedBy: Types.ObjectId | null;
  organizationId: Types.ObjectId;
  schemaVersion: number;
  createdAt: Date;
}

const RentHistorySchema = new Schema<RentHistoryDoc>(
  {
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    flat: { type: Schema.Types.ObjectId, ref: "Flat", required: true },
    floor: { type: Number, required: true },
    amountPaid: { type: Number, required: true, min: 1 },
    paymentDate: { type: Date, required: true },
    period: { type: Number, required: true },
    rentMonth: { type: Number, required: true, min: 1, max: 12 },
    rentYear: { type: Number, required: true },
    paymentMode: { type: String, enum: PAYMENT_MODES, default: "CASH" },
    receiptNumber: { type: String, required: true },
    referenceId: { type: String, default: "", maxlength: 100 },
    notes: { type: String, default: "", maxlength: 500 },
    idempotencyKey: { type: String, default: null },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    schemaVersion: { type: Number, default: 2 },
  },
  { timestamps: true },
);

RentHistorySchema.index(
  { organizationId: 1, receiptNumber: 1 },
  { unique: true },
);
RentHistorySchema.index({ organizationId: 1, tenant: 1, paymentDate: -1 });
RentHistorySchema.index({ organizationId: 1, flat: 1, period: 1 });
RentHistorySchema.index({ organizationId: 1, period: 1, floor: 1 });
RentHistorySchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export const RentHistory = mongoose.model<RentHistoryDoc>(
  "RentHistory",
  RentHistorySchema,
);
