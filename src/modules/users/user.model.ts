import mongoose, { Schema, type Types } from "mongoose";
import { ROLES, type Role } from "../../core/security/permissions";

export interface OtpState {
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
}

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  /** Owning superadmin (organisation). null for superadmins themselves. */
  superadminId: Types.ObjectId | null;
  isVerified: boolean;
  isActive: boolean;
  password?: string;
  /** Incremented to revoke every access/refresh token of the user. */
  tokenVersion: number;
  emailVerification?: OtpState | null;
  passwordReset?: OtpState | null;
  invite?: { tokenHash: string; expiresAt: Date } | null;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const OtpStateSchema = new Schema<OtpState>(
  {
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    role: { type: String, enum: ROLES, default: "superadmin" },
    superadminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    password: { type: String, select: false },
    tokenVersion: { type: Number, default: 0 },
    emailVerification: { type: OtpStateSchema, default: null, select: false },
    passwordReset: { type: OtpStateSchema, default: null, select: false },
    invite: {
      type: new Schema({ tokenHash: String, expiresAt: Date }, { _id: false }),
      default: null,
      select: false,
    },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ superadminId: 1, role: 1, createdAt: -1 });
UserSchema.index(
  { "invite.tokenHash": 1 },
  {
    unique: true,
    partialFilterExpression: { "invite.tokenHash": { $type: "string" } },
  },
);

export const User = mongoose.model<UserDoc>("User", UserSchema);

/** Organisation id: the superadmin's own id, or the inviting superadmin's id. */
export const organizationIdOf = (
  user: Pick<UserDoc, "_id" | "role" | "superadminId">,
): string =>
  user.role === "superadmin" || !user.superadminId
    ? user._id.toHexString()
    : user.superadminId.toHexString();

export interface PublicUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  isVerified: boolean;
  organizationId: string;
  createdAt: Date;
}

export const toPublicUser = (user: UserDoc): PublicUser => ({
  _id: user._id.toHexString(),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  isVerified: user.isVerified,
  organizationId: organizationIdOf(user),
  createdAt: user.createdAt,
});
