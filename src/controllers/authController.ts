import { Request } from "express";
import {
  getMeService,
  loginUserService,
  registerUserService,
  sendOtpService,
  resendOtpService,
  verifyOtpService,
  resetPasswordService,
} from "../service/user.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = asyncHandler(async (req: Request) => {
  return await registerUserService(req);
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
exports.loginUser = asyncHandler(async (req: Request) => {
  return await loginUserService(req);
});

// @desc    Get user data
// @route   GET /api/auth/me
exports.getMe = asyncHandler(async (req: any) => {
  return await getMeService(req);
});

// @desc    Send password reset OTP
// @route   POST /api/auth/forgot-password/send-otp
exports.sendOtp = asyncHandler(async (req: Request) => {
  return await sendOtpService(req);
});

// @desc    Resend password reset OTP
// @route   POST /api/auth/forgot-password/resend-otp
exports.resendOtp = asyncHandler(async (req: Request) => {
  return await resendOtpService(req);
});

// @desc    Verify password reset OTP
// @route   POST /api/auth/forgot-password/verify-otp
exports.verifyOtp = asyncHandler(async (req: Request) => {
  return await verifyOtpService(req);
});

// @desc    Reset password using verified OTP
// @route   POST /api/auth/forgot-password/reset-password
exports.resetPassword = asyncHandler(async (req: Request) => {
  return await resetPasswordService(req);
});

