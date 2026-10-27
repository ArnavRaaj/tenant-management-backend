const express = require("express");
const router = express.Router();
const {
  inviteAdmin,
  acceptInvitation,
  getAdmins,
} = require("../controllers/user.controller");
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
import { validateRequest } from "../middlewares/validationMiddleware";
import {
  inviteAdminSchema,
  acceptInvitationSchema,
} from "../validations/user.validation";
import { createTokenBucketLimiter } from "../middlewares/rateLimiter";

const authLimiter = createTokenBucketLimiter({
  capacity: 10,
  refillRateSeconds: 60,
  keyPrefix: "user-invite",
});

// Only superadmins can see and invite admins
router.post(
  "/invite",
  protect,
  requireSuperadmin,
  validateRequest({ body: inviteAdminSchema }),
  inviteAdmin,
);
router.get("/", protect, requireSuperadmin, getAdmins);

// Public route for admins to accept invitation
router.post(
  "/accept-invitation",
  authLimiter,
  validateRequest({ body: acceptInvitationSchema }),
  acceptInvitation,
);

export default router;
