import { Types } from "mongoose";
import {
  ConflictError,
  ErrorCode,
  NotFoundError,
  UnprocessableError,
} from "../../core/errors/AppError";
import { RateLimits, createLimiter } from "../../core/middleware/rateLimit";
import { recordAuditChange } from "../../core/requestContext";
import { hashToken } from "../../core/security/crypto";
import type { TenantRecord } from "../tenants/tenant.mapper";
import { Tenant } from "../tenants/tenant.model";
import { tenantRepository } from "../tenants/tenant.repository";
import { getKycProvider } from "./kyc.providers";
import { orgIdFromKycToken } from "./kyc.tokens";

/** Each OTP costs money with real providers: cap requests per link. */
const otpPerToken = createLimiter(RateLimits.kycOtpPerToken);

const findTenantByToken = async (token: string): Promise<TenantRecord> => {
  const tenant = await tenantRepository.findByKycTokenHash(
    hashToken(token),
    orgIdFromKycToken(token),
  );
  if (!tenant) {
    throw new NotFoundError(
      "This verification link is invalid or has already been used.",
    );
  }
  if (tenant.kycStatus === "VERIFIED") {
    throw new ConflictError("KYC has already been completed for this tenant");
  }
  if (
    !tenant.kycTokenExpires ||
    tenant.kycTokenExpires.getTime() < Date.now()
  ) {
    throw new UnprocessableError(
      "This verification link has expired. Please ask your property manager for a new link.",
    );
  }
  return tenant;
};

const flatInfo = (t: TenantRecord) =>
  t.flat && !(t.flat instanceof Types.ObjectId)
    ? {
        flatNumber: t.flat.flatNumber,
        floor: t.flat.floor,
        buildingName: t.flat.buildingName ?? "Apartment",
      }
    : { flatNumber: "N/A", floor: null, buildingName: "Apartment" };

/** Public: minimal info shown on the tenant's KYC page (no PII beyond first name/flat). */
export const getKycInfo = async (token: string) => {
  const tenant = await findTenantByToken(token);
  return {
    tenantName: tenant.name,
    ...flatInfo(tenant),
    kycStatus: tenant.kycStatus,
    expiresAt: tenant.kycTokenExpires,
  };
};

export const generateKycOtp = async (token: string, aadhaar: string) => {
  const tenant = await findTenantByToken(token);
  await otpPerToken.consume(hashToken(token));

  const otp = await getKycProvider().generateOtp(aadhaar);
  await Tenant.updateOne(
    { _id: tenant._id, organizationId: tenant.organizationId },
    { $set: { kycClientId: otp.clientId } },
  );
  return {
    clientId: otp.clientId,
    message: otp.message,
    otpSentTo: otp.otpSentTo,
  };
};

export const submitKycOtp = async (token: string, otp: string) => {
  const tenant = await findTenantByToken(token);
  // The provider session must be the one started from THIS link; a client-
  // supplied clientId from another session is never trusted.
  if (!tenant.kycClientId) {
    throw new UnprocessableError(
      "No active OTP request. Please request an OTP first.",
      ErrorCode.INVALID_OTP,
    );
  }
  const verified = await getKycProvider().submitOtp(tenant.kycClientId, otp);

  const update: Record<string, unknown> = {
    kycStatus: "VERIFIED",
    kycVerifiedAt: new Date(),
    kycTokenHash: null,
    kycTokenEnc: null,
    kycTokenExpires: null,
    kycClientId: null,
    // UIDAI returns only a masked number; that is all we keep.
    aadhaarMasked: verified.maskedAadhaar,
  };
  if (verified.gender) update.gender = verified.gender;
  if (verified.address) update.address = verified.address;

  const res = await Tenant.updateOne(
    {
      _id: tenant._id,
      organizationId: tenant.organizationId,
      kycStatus: { $ne: "VERIFIED" },
    },
    { $set: update },
  );
  if (res.modifiedCount !== 1)
    throw new ConflictError("KYC has already been completed");

  recordAuditChange({
    resourceId: tenant._id.toHexString(),
    before: { kycStatus: tenant.kycStatus },
    after: { kycStatus: "VERIFIED" },
  });
  return {
    message: "Aadhaar e-KYC verified successfully!",
    verifiedData: {
      tenantName: tenant.name,
      maskedAadhar: verified.maskedAadhaar,
      ...flatInfo(tenant),
      verifiedAt: update.kycVerifiedAt,
    },
  };
};
