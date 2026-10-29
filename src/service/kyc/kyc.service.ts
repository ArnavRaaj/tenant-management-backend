import { Request } from "express";
import crypto from "crypto";
import {
  findTenantByKycTokenRepo,
  updateTenantDirectRepo,
} from "../../repository/tenant.repository";
import { IKycProvider } from "./kycProvider.interface";
import { MockKycProvider } from "./mockKycProvider";
import { SurepassKycProvider } from "./surepassKycProvider";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../../utils/AppError";
import { encrypt } from "../../utils/encryption";

const getKycProvider = (): IKycProvider => {
  const providerType = (process.env.KYC_PROVIDER || "").toLowerCase();

  // Only use Surepass if explicitly chosen or in production WITH a non-empty API token
  if (
    providerType !== "mock" &&
    process.env.SUREPASS_API_TOKEN &&
    process.env.SUREPASS_API_TOKEN.trim().length > 0 &&
    (providerType === "surepass" || process.env.NODE_ENV === "production")
  ) {
    return new SurepassKycProvider();
  }

  // Built-in free mock provider for local development & testing
  return new MockKycProvider();
};

/**
 * Generates a secure random KYC onboarding token and expiry
 */
export const generateKycTokenData = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
  return { token, expiresAt };
};

/**
 * Public endpoint to fetch tenant and flat details by KYC token
 */
export const getKycInfoService = async (req: Request) => {
  const { token } = req.params;
  if (!token) {
    throw new BadRequestError("KYC token is required");
  }

  const tenant = await findTenantByKycTokenRepo(token as string);
  if (!tenant) {
    throw new NotFoundError(
      "Verification link is invalid or has already been completed.",
    );
  }

  const isExpired =
    tenant.kycTokenExpires && new Date(tenant.kycTokenExpires) < new Date();
  if (isExpired) {
    throw new BadRequestError(
      "This verification link has expired. Please contact your property manager for a new link.",
    );
  }

  const flat = tenant.flat as any;

  return {
    success: true,
    data: {
      tenantName: tenant.name,
      flatNumber: flat?.flatNumber || "N/A",
      floor: flat?.floor !== undefined ? flat.floor : null,
      buildingName: flat?.buildingName || "Apartment",
      kycStatus: tenant.kycStatus,
      isExpired: false,
    },
  };
};

/**
 * Initiates Aadhaar OTP generation for the tenant
 */
export const generateKycOtpService = async (req: Request) => {
  const { token, aadharNumber } = req.body;
  if (!token) {
    throw new BadRequestError("KYC token is required");
  }
  if (!aadharNumber) {
    throw new BadRequestError("Please provide a 12-digit Aadhaar number");
  }

  const cleanAadhaar = aadharNumber.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(cleanAadhaar)) {
    throw new BadRequestError("Aadhaar number must contain exactly 12 digits");
  }

  const tenant = await findTenantByKycTokenRepo(token);
  if (!tenant) {
    throw new NotFoundError("Invalid or expired verification session");
  }

  if (tenant.kycStatus === "VERIFIED") {
    throw new ConflictError("Tenant KYC has already been verified");
  }

  if (tenant.kycTokenExpires && new Date(tenant.kycTokenExpires) < new Date()) {
    throw new BadRequestError("Verification link has expired");
  }

  const provider = getKycProvider();
  const otpRes = await provider.generateOtp(cleanAadhaar);

  // Store client ID for session verification
  tenant.kycClientId = otpRes.clientId;
  await tenant.save();

  return {
    success: true,
    clientId: otpRes.clientId,
    message: otpRes.message,
    otpSentTo: otpRes.otpSentTo || "Aadhaar registered mobile",
  };
};

/**
 * Submits the OTP to complete UIDAI/DigiLocker verification
 */
export const submitKycOtpService = async (req: Request) => {
  const { token, otp, clientId } = req.body;
  if (!token) {
    throw new BadRequestError("KYC token is required");
  }
  if (!otp) {
    throw new BadRequestError("Please enter the 6-digit OTP");
  }

  const cleanOtp = otp.toString().trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new BadRequestError("OTP must be exactly 6 digits");
  }

  const tenant = await findTenantByKycTokenRepo(token);
  if (!tenant) {
    throw new NotFoundError("Invalid or expired verification session");
  }

  if (tenant.kycStatus === "VERIFIED") {
    throw new ConflictError("Tenant KYC has already been verified");
  }

  const activeClientId = clientId || tenant.kycClientId;
  if (!activeClientId) {
    throw new BadRequestError(
      "No active OTP request found. Please request an OTP first.",
    );
  }

  const provider = getKycProvider();
  const verifyRes = await provider.submitOtp(activeClientId, cleanOtp);

  if (!verifyRes.verified) {
    throw new BadRequestError("Aadhaar OTP verification failed");
  }

  // Update Tenant with verified Aadhaar data & mask
  const encryptedAadhar = encrypt(verifyRes.maskedAadhar);

  tenant.aadharNumber = encryptedAadhar;
  if (verifyRes.gender) tenant.gender = encrypt(verifyRes.gender);

  if (verifyRes.address) {
    tenant.address = {
      addressLine1: verifyRes.address.addressLine1 || tenant.address?.addressLine1 || "",
      addressLine2: verifyRes.address.addressLine2 || tenant.address?.addressLine2 || "",
      city: verifyRes.address.city || tenant.address?.city || "",
      state: verifyRes.address.state || tenant.address?.state || "",
      postalCode: verifyRes.address.postalCode || tenant.address?.postalCode || "",
    };
  }

  tenant.kycStatus = "VERIFIED";
  tenant.kycVerifiedAt = new Date();
  tenant.kycToken = null; // Invalidate token once verified
  tenant.kycClientId = null;

  await tenant.save();

  const flat = tenant.flat as any;

  return {
    success: true,
    message: "Aadhaar e-KYC verified successfully!",
    verifiedData: {
      tenantName: tenant.name,
      maskedAadhar: verifyRes.maskedAadhar,
      flatNumber: flat?.flatNumber,
      buildingName: flat?.buildingName,
      verifiedAt: tenant.kycVerifiedAt,
    },
  };
};

