import { Request, Response } from "express";
import { getDashboardStatsService } from "../service/dashboard.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get dashboard metrics (Monthly totals and floor-wise)
// @route   GET /api/dashboard/stats
exports.getDashboardStats = asyncHandler(
  async (req: Request, res: Response) => {
    return await getDashboardStatsService(req, res);
  },
);
