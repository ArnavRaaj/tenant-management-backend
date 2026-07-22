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
const { validateRequest } = require("../middlewares/validationMiddleware");
const {
  getFlatsSchema,
  createFlatSchema,
  flatIdParamSchema,
} = require("../validations/flat.validation");

router
  .route("/")
  .get(protect, validateRequest(getFlatsSchema), getFlats) // supports ?status=vacant|occupied
  .post(protect, validateRequest(createFlatSchema), createFlat);
router
  .route("/:id")
  .get(protect, validateRequest(flatIdParamSchema), getFlat)
  .delete(protect, validateRequest(flatIdParamSchema), deleteFlat); // only allowed when unoccupied

// Flat-scoped history & analytics
router.get(
  "/:id/tenants",
  protect,
  validateRequest(flatIdParamSchema),
  getFlatTenantHistory,
);

// All tenants ever in this flat
router.get(
  "/:id/revenue",
  protect,
  validateRequest(flatIdParamSchema),
  getFlatRevenue,
);

// Revenue breakdown for this flat
router.get(
  "/:id/vacant-history",
  protect,
  validateRequest(flatIdParamSchema),
  getFlatVacantHistory,
);

// Vacancy periods for this flat

module.exports = router;
