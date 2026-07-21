const express = require("express");
const router = express.Router();
const {
  getMe,
  loginUser,
  registerUser,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { body } = require("express-validator");
const { validateRequest } = require("../middlewares/validationMiddleware");

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please include a valid email"),
    body("password").exists().withMessage("Password is required"),
  ],
  validateRequest,
  loginUser,
);
router.get("/me", protect, getMe);
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Please include a valid email"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Please enter a password with 6 or more characters"),
  ],
  validateRequest,
  registerUser,
);
module.exports = router;
