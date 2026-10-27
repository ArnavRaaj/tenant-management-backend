const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
import { getAuditLogsRepo } from "../repository/audit.repository";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get organization audit logs (Who, When, What)
// @route   GET /api/audit-logs
// @access  Private (Superadmin only)
router.get(
  "/",
  protect,
  requireSuperadmin,
  asyncHandler(async (req: any) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const organizationId = req.organizationId;

    const logs = await getAuditLogsRepo({ organizationId }, limit, page);
    return logs;
  }),
);

export default router;
