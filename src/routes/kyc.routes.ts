import express from "express";
import {
  getKycInfo,
  submitKycOtp,
  generateKycOtp,
} from "../controllers/kyc.controller";
import {
  getKycInfoSchema,
  submitKycOtpSchema,
  generateKycOtpSchema,
} from "../validations/kyc.validation";
const { validateRequest } = require("../middlewares/validationMiddleware");

const router = express.Router();

router.get("/info/:token", validateRequest(getKycInfoSchema), getKycInfo);
router.post(
  "/generate-otp",
  validateRequest(generateKycOtpSchema),
  generateKycOtp,
);
router.post("/submit-otp", validateRequest(submitKycOtpSchema), submitKycOtp);

export default router;

