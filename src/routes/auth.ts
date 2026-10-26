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
  verifyEmail,
  resendVerifyEmail,
} = require("../controllers/auth.controller");
const {
  loginSchema,
  sendOtpSchema,
  registerSchema,
  resendOtpSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} = require("../validations/auth.validation");
const { protect } = require("../middlewares/authMiddleware");
import { createTokenBucketLimiter } from "../middlewares/rateLimiter";
const { validateRequest } = require("../middlewares/validationMiddleware");

const rateLimiter = createTokenBucketLimiter({
  capacity: 5,
  refillRateSeconds: 60,
  keyPrefix: "otp_limit",
});

router.get("/me", protect, getMe);

router.post("/login", rateLimiter, validateRequest(loginSchema), loginUser);

router.post(
  "/register",
  rateLimiter,
  validateRequest(registerSchema),
  registerUser,
);

router.post(
  "/verify-email",
  rateLimiter,
  validateRequest(verifyEmailSchema),
  verifyEmail,
);

router.post(
  "/resend-verify-email",
  rateLimiter,
  validateRequest(sendOtpSchema),
  resendVerifyEmail,
);

// ======================== FORGOT PASSWORD ENDPOINTS ========================

router.post(
  "/forgot-password/send-otp",
  rateLimiter,
  validateRequest(sendOtpSchema),
  sendOtp,
);

router.post(
  "/forgot-password/resend-otp",
  rateLimiter,
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
