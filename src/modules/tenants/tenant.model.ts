import mongoose, { Schema, type Types } from "mongoose";

export const KYC_STATUSES = ["PENDING", "VERIFIED", "FAILED"] as const;
export const PAYMENT_PATTERNS = [
  "NEW",
  "ON_TIME",
  "MID_MONTH",
  "CHRONIC_LATE",
] as const;
export const GENDERS = ["male", "female", "other"] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];
export type PaymentPattern = (typeof PAYMENT_PATTERNS)[number];
export type Gender = (typeof GENDERS)[number];

export interface TenantAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  state: string;
}

/**
 * Data-protection rules:
 *  - contactNumber: AES-256-GCM encrypted; contactNumberHash (HMAC) is the
 *    searchable blind index used for WhatsApp lookups.
 *  - Aadhaar: the full number is NEVER stored — only the masked form and an
 *    HMAC for duplicate detection (Aadhaar Act / UIDAI storage rules).
 *  - aadharImage: encrypted reference to a private (authenticated) asset.
 *  - Money: integer paise. Rent months: integer period YYYYMM.
 */
export interface TenantDoc {
  _id: Types.ObjectId;
  name: string;
  contactNumber: string;
  contactNumberHash: string;
  age: number | null;
  aadhaarMasked: string | null;
  aadhaarHash: string | null;
  gender: Gender | null;
  aadharImage: string | null;
  address: TenantAddress;
  occupantsCount: number;
  securityDeposit: number;
  monthlyRent: number;
  pendingBalance: number;
  isActive: boolean;
  vacatedDate: Date | null;
  kycStatus: KycStatus;
  kycTokenHash: string | null;
  kycTokenEnc: string | null;
  kycTokenExpires: Date | null;
  kycVerifiedAt: Date | null;
  kycClientId: string | null;
  paymentPattern: PaymentPattern;
  lastPaidPeriod: number | null;
  dateOfRenting: Date;
  flat: Types.ObjectId;
  organizationId: Types.ObjectId;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TENANT_SCHEMA_VERSION = 2;

const AddressSchema = new Schema<TenantAddress>(
  {
    addressLine1: { type: String, default: "", maxlength: 200 },
    addressLine2: { type: String, default: "", maxlength: 200 },
    city: { type: String, default: "", maxlength: 100 },
    postalCode: { type: String, default: "", maxlength: 10 },
    state: { type: String, default: "", maxlength: 100 },
  },
  { _id: false },
);

const TenantSchema = new Schema<TenantDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    contactNumber: { type: String, required: true },
    contactNumberHash: { type: String, required: true },
    age: { type: Number, default: null, min: 0, max: 150 },
    aadhaarMasked: { type: String, default: null },
    aadhaarHash: { type: String, default: null },
    gender: { type: String, enum: [...GENDERS, null], default: null },
    aadharImage: { type: String, default: null },
    address: { type: AddressSchema, default: () => ({}) },
    occupantsCount: { type: Number, default: 1, min: 1, max: 50 },
    securityDeposit: { type: Number, required: true, min: 0 },
    monthlyRent: { type: Number, required: true, min: 0 },
    pendingBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    vacatedDate: { type: Date, default: null },
    kycStatus: { type: String, enum: KYC_STATUSES, default: "PENDING" },
    kycTokenHash: { type: String, default: null },
    kycTokenEnc: { type: String, default: null },
    kycTokenExpires: { type: Date, default: null },
    kycVerifiedAt: { type: Date, default: null },
    kycClientId: { type: String, default: null },
    paymentPattern: { type: String, enum: PAYMENT_PATTERNS, default: "NEW" },
    lastPaidPeriod: { type: Number, default: null },
    dateOfRenting: { type: Date, default: Date.now },
    flat: { type: Schema.Types.ObjectId, ref: "Flat", required: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    schemaVersion: { type: Number, default: TENANT_SCHEMA_VERSION },
  },
  { timestamps: true },
);

// Every hot query is prefixed by organizationId (tenant isolation + shard key).
TenantSchema.index({ organizationId: 1, isActive: 1, createdAt: -1 });
TenantSchema.index({ organizationId: 1, isActive: 1, pendingBalance: 1 });
TenantSchema.index({ organizationId: 1, flat: 1, dateOfRenting: -1 });
// WhatsApp inbound lookup by blind index (only active tenants are matched).
TenantSchema.index({ contactNumberHash: 1, isActive: 1 });
// 256-bit random tokens make collisions negligible; not declared unique
// because a global unique index is incompatible with sharding by organizationId.
TenantSchema.index(
  { kycTokenHash: 1 },
  { partialFilterExpression: { kycTokenHash: { $type: "string" } } },
);

export const Tenant = mongoose.model<TenantDoc>("Tenant", TenantSchema);
