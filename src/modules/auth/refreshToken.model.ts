import mongoose, { Schema, type Types } from "mongoose";

/**
 * Opaque refresh tokens (stored only as HMAC hashes) organised in rotation
 * families. Presenting an already-rotated token outside the grace window
 * is treated as theft and revokes the whole family.
 */
export type RevokeReason =
  "rotated" | "logout" | "reuse_detected" | "revoked_all";

export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  tokenHash: string;
  userId: Types.ObjectId;
  familyId: string;
  tokenVersion: number;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    familyId: { type: String, required: true },
    tokenVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 512 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

RefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });
RefreshTokenSchema.index({ familyId: 1 });
// MongoDB TTL monitor deletes expired tokens automatically.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model<RefreshTokenDoc>(
  "RefreshToken",
  RefreshTokenSchema,
);
