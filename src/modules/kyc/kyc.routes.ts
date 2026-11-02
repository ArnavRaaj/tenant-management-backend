import { Router } from "express";
import Joi from "joi";
import { handle, ok } from "../../core/http/apiResponse";
import { RateLimits, rateLimit } from "../../core/middleware/rateLimit";
import { validate } from "../../core/middleware/validate";
import { audit } from "../audit/audit.middleware";
import * as kycService from "./kyc.service";
import { KYC_TOKEN_PATTERN } from "./kyc.tokens";

const token = Joi.string()
  .lowercase()
  .pattern(KYC_TOKEN_PATTERN)
  .required()
  .messages({ "string.pattern.base": "Invalid verification link" });

const schemas = {
  info: { params: Joi.object({ token }) },
  generate: {
    body: Joi.object({
      token,
      aadharNumber: Joi.string()
        .trim()
        .custom((v: string, helpers) => {
          const digits = v.replace(/\s|-/g, "");
          return /^[2-9]\d{11}$/.test(digits)
            ? digits
            : helpers.error("string.pattern.base");
        })
        .required()
        .messages({
          "string.pattern.base": "Aadhaar number must be exactly 12 digits",
        }),
    }),
  },
  submit: {
    body: Joi.object({
      token,
      otp: Joi.string()
        .pattern(/^\d{6}$/)
        .required()
        .messages({ "string.pattern.base": "OTP must be exactly 6 digits" }),
    }),
  },
};

const router = Router();

// Public (link-based) endpoints — rate limited per IP; OTPs additionally per link.
router.use(rateLimit(RateLimits.kycPublic));

router.get(
  "/info/:token",
  validate(schemas.info),
  handle(async (req) =>
    ok(await kycService.getKycInfo(String(req.params.token))),
  ),
);
router.post(
  "/generate-otp",
  validate(schemas.generate),
  audit("KYC_OTP_REQUEST", "kyc", { includeBody: false }),
  handle(async (req) =>
    ok(await kycService.generateKycOtp(req.body.token, req.body.aadharNumber)),
  ),
);
router.post(
  "/submit-otp",
  validate(schemas.submit),
  audit("KYC_VERIFY", "kyc", { includeBody: false }),
  handle(async (req) =>
    ok(await kycService.submitKycOtp(req.body.token, req.body.otp)),
  ),
);

export default router;
