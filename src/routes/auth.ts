const express = require("express");
const router = express.Router();
const {
  getMe,
  loginUser,
  registerUser,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");

router.post("/login", loginUser);
router.get("/me", protect, getMe);
router.post("/register", registerUser);

module.exports = router;
