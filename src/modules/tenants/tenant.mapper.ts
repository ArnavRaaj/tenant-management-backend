import { Types } from "mongoose";
import { decryptOrNull } from "../../core/security/crypto";
import { toRupees } from "../../core/utils/money";
import {
  currentPeriod,
  monthName,
  periodMonth,
  periodYear,
} from "../../core/utils/period";
import { resolveAssetUrl } from "../storage/storage.service";
import type { RentHistoryDoc } from "./rent.model";
import type { TenantDoc } from "./tenant.model";

export interface FlatSummary {
  _id: Types.ObjectId;
  flatNumber: string;
  floor: number;
  buildingName?: string;
}

export type TenantRecord = Omit<TenantDoc, "flat"> & {
  flat: Types.ObjectId | FlatSummary | null;
};

/**
 * API representation of a tenant. Field names are kept compatible with the
 * frontend; values are converted (paise → rupees, period → month name) and
 * decrypted here, at the boundary, and nowhere else.
 */
export interface TenantDto {
  _id: string;
  name: string;
  contactNumber: string | null;
  age: number | null;
  aadharNumber: string | null; // always masked: XXXX-XXXX-1234
  gender: string | null;
  hasAadharImage: boolean;
  aadharImage?: string | null; // short-lived signed URL (detail views only)
  address: TenantDoc["address"];
  occupantsCount: number;
  securityDeposit: number;
  monthlyRent: number;
  pendingBalance: number;
  isActive: boolean;
  vacatedDate: Date | null;
  kycStatus: TenantDoc["kycStatus"];
  kycVerifiedAt: Date | null;
  /** True when KYC was completed with the simulated (demo) provider. */
  kycSimulated: boolean;
  paymentPattern: TenantDoc["paymentPattern"];
  lastPaidMonth: string | null;
  lastPaidYear: number | null;
  isCurrentMonthPaid: boolean;
  dateOfRenting: Date;
  flat:
    | { _id: string; flatNumber: string; floor: number; buildingName?: string }
    | string
    | null;
  createdAt: Date;
  updatedAt: Date;
}

const flatDto = (flat: TenantRecord["flat"]): TenantDto["flat"] => {
  if (!flat) return null;
  if (flat instanceof Types.ObjectId) return flat.toHexString();
  return {
    _id: flat._id.toHexString(),
    flatNumber: flat.flatNumber,
    floor: flat.floor,
    ...(flat.buildingName ? { buildingName: flat.buildingName } : {}),
  };
};

export const toTenantDto = (
  t: TenantRecord,
  options: { includeDocumentUrl?: boolean } = {},
): TenantDto => {
  const now = currentPeriod();
  return {
    _id: t._id.toHexString(),
    name: t.name,
    contactNumber: decryptOrNull(t.contactNumber),
    age: t.age ?? null,
    aadharNumber: t.aadhaarMasked ?? null,
    gender: t.gender ?? null,
    hasAadharImage: Boolean(t.aadharImage),
    ...(options.includeDocumentUrl
      ? { aadharImage: resolveAssetUrl(decryptOrNull(t.aadharImage)) }
      : {}),
    address: t.address,
    occupantsCount: t.occupantsCount,
    securityDeposit: toRupees(t.securityDeposit),
    monthlyRent: toRupees(t.monthlyRent),
    pendingBalance: toRupees(t.pendingBalance),
    isActive: t.isActive,
    vacatedDate: t.vacatedDate ?? null,
    kycStatus: t.kycStatus,
    kycVerifiedAt: t.kycVerifiedAt ?? null,
    kycSimulated: t.kycStatus === "VERIFIED" && t.kycProvider === "mock",
    paymentPattern: t.paymentPattern,
    lastPaidMonth: t.lastPaidPeriod
      ? monthName(periodMonth(t.lastPaidPeriod))
      : null,
    lastPaidYear: t.lastPaidPeriod ? periodYear(t.lastPaidPeriod) : null,
    isCurrentMonthPaid: (t.lastPaidPeriod ?? 0) >= now,
    dateOfRenting: t.dateOfRenting,
    flat: flatDto(t.flat),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
};

/** Non-sensitive snapshot for the audit diff. */
export const tenantAuditSnapshot = (
  t: TenantRecord,
): Record<string, unknown> => ({
  name: t.name,
  age: t.age,
  gender: t.gender,
  address: t.address,
  occupantsCount: t.occupantsCount,
  securityDeposit: toRupees(t.securityDeposit),
  monthlyRent: toRupees(t.monthlyRent),
  pendingBalance: toRupees(t.pendingBalance),
  isActive: t.isActive,
  vacatedDate: t.vacatedDate,
  dateOfRenting: t.dateOfRenting,
  kycStatus: t.kycStatus,
  contactNumber: t.contactNumberHash, // diffed by hash, rendered as [REDACTED]
  aadharNumber: t.aadhaarHash,
  aadharImage: t.aadharImage,
});

export interface RentRecordDto {
  _id: string;
  tenant: string;
  flat: string;
  amountPaid: number;
  paymentDate: Date;
  rentMonth: string;
  rentYear: number;
  paymentMode: RentHistoryDoc["paymentMode"];
  receiptNumber: string;
  referenceId: string;
  notes: string;
  createdAt: Date;
}

export const toRentRecordDto = (r: RentHistoryDoc): RentRecordDto => ({
  _id: r._id.toHexString(),
  tenant: r.tenant.toHexString(),
  flat: r.flat.toHexString(),
  amountPaid: toRupees(r.amountPaid),
  paymentDate: r.paymentDate,
  rentMonth: monthName(r.rentMonth),
  rentYear: r.rentYear,
  paymentMode: r.paymentMode,
  receiptNumber: r.receiptNumber,
  referenceId: r.referenceId,
  notes: r.notes,
  createdAt: r.createdAt,
});
