import mongoose, { Schema, type Types } from "mongoose";

export interface FlatDoc {
  _id: Types.ObjectId;
  flatNumber: string;
  floor: number;
  buildingName: string;
  currentTenant: Types.ObjectId | null;
  address: Types.ObjectId | null;
  organizationId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FlatSchema = new Schema<FlatDoc>(
  {
    flatNumber: { type: String, required: true, trim: true, maxlength: 20 },
    floor: { type: Number, required: true, min: 0, max: 200 },
    buildingName: { type: String, required: true, trim: true, maxlength: 100 },
    currentTenant: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    address: { type: Schema.Types.ObjectId, ref: "Address", default: null },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Uniqueness is per organisation: two orgs may both have "Flat 101".
FlatSchema.index(
  { organizationId: 1, buildingName: 1, flatNumber: 1 },
  { unique: true },
);
FlatSchema.index({ organizationId: 1, currentTenant: 1 });
FlatSchema.index({ organizationId: 1, floor: 1, flatNumber: 1 });

export const Flat = mongoose.model<FlatDoc>("Flat", FlatSchema);
