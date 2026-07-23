const express = require("express");
const router = express.Router();
const {
  getMe,
  loginUser,
  registerUser,
} = require("../controllers/authController");
const {
  loginSchema,
  registerSchema,
} = require("../validations/auth.validation");
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
const { validateRequest } = require("../middlewares/validationMiddleware");

router.get("/me", protect, getMe);

router.post("/login", validateRequest(loginSchema), loginUser);

router.post(
  "/register",
  protect,
  requireSuperadmin,
  validateRequest(registerSchema),
  registerUser,
);

module.exports = router;
