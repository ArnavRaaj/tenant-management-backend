const express = require("express");
const router = express.Router();
const {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  changeTenant,
  addRentRecord,
  getRentHistoryForTenant,
} = require("../controllers/tenantController");
const { protect } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const { body, param, query } = require("express-validator");
const { validateRequest } = require("../middlewares/validationMiddleware");
router
  .route("/")
  .get(
    protect,
    [
      query("status").optional().isIn(["active", "past"]),
      query("rentDue").optional().isBoolean(),
    ],
    validateRequest,
    getTenants,
  )
  .post(
    protect,
    upload.single("aadharImage"),
    [
      body("name").notEmpty(),
      body("contactNumber").notEmpty(),
      body("securityDeposit").isNumeric(),
      body("monthlyRent").isNumeric(),
      body("flatId").isMongoId(),
    ],
    validateRequest,
    createTenant,
  );

router
  .route("/:id")
  .get(protect, [param("id").isMongoId()], validateRequest, getTenant)
  .put(
    protect,
    upload.single("aadharImage"),
    [
      param("id").isMongoId(),
      body("name").optional().notEmpty(),
      body("contactNumber").optional().notEmpty(),
      body("securityDeposit").optional().isNumeric(),
      body("monthlyRent").optional().isNumeric(),
    ],
    validateRequest,
    updateTenant,
  );

router.post(
  "/:id/change",
  protect,
  upload.single("aadharImage"),
  [
    param("id").isMongoId(),
    body("name").notEmpty(),
    body("contactNumber").notEmpty(),
    body("securityDeposit").isNumeric(),
    body("monthlyRent").isNumeric(),
  ],
  validateRequest,
  changeTenant,
);

router
  .route("/:id/rent")
  .get(
    protect,
    [param("id").isMongoId()],
    validateRequest,
    getRentHistoryForTenant,
  )
  .post(
    protect,
    [
      param("id").isMongoId(),
      body("amountPaid").isNumeric(),
      body("rentMonth").notEmpty(),
      body("rentYear").isNumeric(),
    ],
    validateRequest,
    addRentRecord,
  );

module.exports = router;
