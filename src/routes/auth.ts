const express = require("express");
const router = express.Router();
const {
  getMe,
  sendOtp,
  loginUser,
  resendOtp,
  verifyOtp,
  registerUser,
  resetPassword,
} = require("../controllers/auth.controller");
const {
  loginSchema,
  sendOtpSchema,
  registerSchema,
  resendOtpSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} = require("../validations/auth.validation");
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
import { createTokenBucketLimiter } from "../middlewares/rateLimiter";
const { validateRequest } = require("../middlewares/validationMiddleware");

// Instantiate Token Bucket rate limiter for OTP requests (Max 3 tokens in burst, 1 refilled every 60s)
const otpLimiter = createTokenBucketLimiter({
  capacity: 3,
  refillRateSeconds: 60,
  keyPrefix: "otp_limit",
});

router.get("/me", protect, getMe);

router.post("/login", validateRequest(loginSchema), loginUser);

router.post(
  "/register",
  protect,
  requireSuperadmin,
  validateRequest(registerSchema),
  registerUser,
);

// ======================== FORGOT PASSWORD ENDPOINTS ========================

router.post(
  "/forgot-password/send-otp",
  otpLimiter,
  validateRequest(sendOtpSchema),
  sendOtp,
);

router.post(
  "/forgot-password/resend-otp",
  otpLimiter,
  validateRequest(resendOtpSchema),
  resendOtp,
);

router.post(
  "/forgot-password/verify-otp",
  validateRequest(verifyOtpSchema),
  verifyOtp,
);

router.post(
  "/forgot-password/reset-password",
  validateRequest(resetPasswordSchema),
  resetPassword,
);

module.exports = router;
