import { Request } from "express";
import {
  getKycInfoService,
  generateKycOtpService,
  submitKycOtpService,
} from "../service/kyc/kyc.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get tenant verification public info by token
// @route   GET /api/kyc/info/:token
export const getKycInfo = asyncHandler(async (req: Request) => {
  return await getKycInfoService(req);
});

// @desc    Generate Aadhaar OTP
// @route   POST /api/kyc/generate-otp
export const generateKycOtp = asyncHandler(async (req: Request) => {
  return await generateKycOtpService(req);
});

// @desc    Submit Aadhaar OTP & Complete Verification
// @route   POST /api/kyc/submit-otp
export const submitKycOtp = asyncHandler(async (req: Request) => {
  return await submitKycOtpService(req);
});

