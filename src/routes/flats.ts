const express = require("express");
const router = express.Router();
const {
  getFlat,
  getFlats,
  createFlat,
  deleteFlat,
  getFlatRevenue,
  getBuildingTags,
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
  .get(protect, validateRequest(getFlatsSchema), getFlats) // supports ?status=vacant|occupied&buildingName=...
  .post(
    protect,
    requireSuperadmin,
    validateRequest(createFlatSchema),
    createFlat,
  );

const { getFloors } = require("../controllers/floor.controller");

// Static path avoids any conflict with /:id wildcard
router.get("/meta/tags", protect, getBuildingTags);
router.get("/meta/floors", protect, getFloors);

router.get("/:id", protect, validateRequest(flatIdParamSchema), getFlat);
router.delete(
  "/:id",
  protect,
  requireSuperadmin,
  validateRequest(flatIdParamSchema),
  deleteFlat,
);

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

export default router;
