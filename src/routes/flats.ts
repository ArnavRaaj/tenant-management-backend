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
} = require("../controllers/flat.controller");
const {
  getFlatsSchema,
  createFlatSchema,
  flatIdParamSchema,
} = require("../validations/flat.validation");
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
const { validateRequest } = require("../middlewares/validationMiddleware");

router
  .route("/")
  .get(protect, validateRequest(getFlatsSchema), getFlats) // supports ?status=vacant|occupied
  .post(
    protect,
    requireSuperadmin,
    validateRequest(createFlatSchema),
    createFlat,
  );

router
  .route("/:id")
  .get(protect, validateRequest(flatIdParamSchema), getFlat)
  .delete(
    protect,
    requireSuperadmin,
    validateRequest(flatIdParamSchema),
    deleteFlat,
  ); // only allowed when unoccupied

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
