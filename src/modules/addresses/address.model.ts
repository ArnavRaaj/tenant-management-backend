import mongoose, { Schema, type Types } from "mongoose";

/** Building addresses, shared by everyone in the organisation. */
export interface AddressDoc {
  _id: Types.ObjectId;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  state: string;
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const AddressSchema = new Schema<AddressDoc>(
  {
    addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
    addressLine2: { type: String, default: "", trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, required: true, match: /^\d{6}$/ },
    state: { type: String, required: true, trim: true, maxlength: 100 },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

AddressSchema.index({ organizationId: 1, createdAt: -1 });

export const Address = mongoose.model<AddressDoc>("Address", AddressSchema);
