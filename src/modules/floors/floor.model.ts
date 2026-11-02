import mongoose, { Schema, type Types } from "mongoose";

/** Floors are per-organisation labels (previously global across all orgs). */
export interface FloorDoc {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  floorNumber: number;
  name: string;
  order: number;
  isActive: boolean;
}

const FloorSchema = new Schema<FloorDoc>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    floorNumber: { type: Number, required: true, min: 0, max: 200 },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

FloorSchema.index({ organizationId: 1, floorNumber: 1 }, { unique: true });
FloorSchema.index({ organizationId: 1, isActive: 1, order: 1 });

export const Floor = mongoose.model<FloorDoc>("Floor", FloorSchema);

export const DEFAULT_FLOORS = Array.from({ length: 11 }, (_, n) => ({
  floorNumber: n,
  name:
    n === 0
      ? "Ground Floor"
      : `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} Floor`,
  order: n,
}));
