const express = require("express");
const router = express.Router();
const {
  getMe,
  loginUser,
  registerUser,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validationMiddleware");
const {
  loginSchema,
  registerSchema,
} = require("../validations/auth.validation");

router.get("/me", protect, getMe);
router.post("/login", validateRequest(loginSchema), loginUser);
router.post("/register", validateRequest(registerSchema), registerUser);

module.exports = router;
