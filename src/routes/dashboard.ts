const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/dashboardController");
const { protect } = require("../middlewares/authMiddleware");
const { query } = require("express-validator");
const { validateRequest } = require("../middlewares/validationMiddleware");

router.get(
  "/stats",
  protect,
  [query("month").optional().isString(), query("year").optional().isNumeric()],
  validateRequest,
  getDashboardStats,
);

module.exports = router;
