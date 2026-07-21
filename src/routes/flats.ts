const express = require("express");
const router = express.Router();
const {
  getFlat,
  getFlats,
  createFlat,
  deleteFlat,
  getFlatRevenue,
  getFlatTenantHistory,
  getFlatVacantHistory,
} = require("../controllers/flatController");
const { protect } = require("../middlewares/authMiddleware");
const { body, param, query } = require("express-validator");
const { validateRequest } = require("../middlewares/validationMiddleware");

router
  .route("/")
  .get(
    protect,
    [query("status").optional().isIn(["vacant", "occupied"])],
    validateRequest,
    getFlats,
  ) // supports ?status=vacant|occupied
  .post(
    protect,
    [
      body("flatNumber").notEmpty().withMessage("Flat number is required"),
      body("floor").isNumeric().withMessage("Floor must be a number"),
    ],
    validateRequest,
    createFlat,
  );
router
  .route("/:id")
  .get(protect, [param("id").isMongoId()], validateRequest, getFlat)
  .delete(protect, [param("id").isMongoId()], validateRequest, deleteFlat); // only allowed when unoccupied

// Flat-scoped history & analytics
router.get(
  "/:id/tenants",
  protect,
  [param("id").isMongoId()],
  validateRequest,
  getFlatTenantHistory,
); // All tenants ever in this flat
router.get(
  "/:id/revenue",
  protect,
  [param("id").isMongoId()],
  validateRequest,
  getFlatRevenue,
); // Revenue breakdown for this flat
router.get(
  "/:id/vacant-history",
  protect,
  [param("id").isMongoId()],
  validateRequest,
  getFlatVacantHistory,
); // Vacancy periods for this flat

module.exports = router;
