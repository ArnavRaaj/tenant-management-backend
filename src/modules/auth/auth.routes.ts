import { Router } from "express";
import { handle } from "../../core/http/apiResponse";
import { RateLimits, rateLimit } from "../../core/middleware/rateLimit";
import { validate } from "../../core/middleware/validate";
import { audit } from "../audit/audit.middleware";
import * as controller from "./auth.controller";
import { authenticate } from "./auth.middleware";
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from "./auth.validation";

const router = Router();

const otpSend = rateLimit(RateLimits.otpSend);
const otpVerify = rateLimit(RateLimits.otpVerify);

router.post(
  "/register",
  otpSend,
  validate(registerSchema),
  audit("REGISTER", "auth"),
  handle(controller.register),
);
router.post(
  "/verify-email",
  otpVerify,
  validate(verifyOtpSchema),
  audit("VERIFY_EMAIL", "auth"),
  handle(controller.verifyEmail),
);
router.post(
  "/resend-verify-email",
  otpSend,
  validate(emailOnlySchema),
  handle(controller.resendVerification),
);

router.post(
  "/login",
  rateLimit(RateLimits.login),
  validate(loginSchema),
  audit("LOGIN", "auth"),
  handle(controller.login),
);
router.post(
  "/refresh",
  rateLimit(RateLimits.refresh),
  handle(controller.refresh),
);
router.post("/logout", audit("LOGOUT", "auth"), handle(controller.logout));
router.post(
  "/logout-all",
  authenticate,
  audit("LOGOUT_ALL_SESSIONS", "auth"),
  handle(controller.logoutAll),
);
router.get("/me", authenticate, handle(controller.me));

// ── Forgot password ──
router.post(
  "/forgot-password/send-otp",
  otpSend,
  validate(emailOnlySchema),
  audit("PASSWORD_RESET_REQUEST", "auth"),
  handle(controller.requestPasswordReset),
);
router.post(
  "/forgot-password/resend-otp",
  otpSend,
  validate(emailOnlySchema),
  handle(controller.requestPasswordReset),
);
router.post(
  "/forgot-password/verify-otp",
  otpVerify,
  validate(verifyOtpSchema),
  handle(controller.verifyPasswordResetOtp),
);
router.post(
  "/forgot-password/reset-password",
  otpVerify,
  validate(resetPasswordSchema),
  audit("PASSWORD_RESET", "auth"),
  handle(controller.resetPassword),
);

export default router;
