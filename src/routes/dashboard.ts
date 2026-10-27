const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validationMiddleware");
const { getDashboardStats } = require("../controllers/dashboard.controller");
import { getDashboardStatsSchema } from "../validations/dashboard.validation";

router.get(
  "/stats",
  protect,
  validateRequest(getDashboardStatsSchema),
  getDashboardStats,
);

export default router;
