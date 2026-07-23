const express = require("express");
const router = express.Router();
const {
  getTenant,
  getTenants,
  createTenant,
  updateTenant,
  changeTenant,
  addRentRecord,
  getRentHistoryForTenant,
} = require("../controllers/tenantController");
import {
  getTenantsSchema,
  createTenantSchema,
  updateTenantSchema,
  changeTenantSchema,
  tenantIdParamSchema,
  addRentRecordSchema,
} from "../validations/tenant.validation";
const upload = require("../middlewares/uploadMiddleware");
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
const { validateRequest } = require("../middlewares/validationMiddleware");

router
  .route("/")
  .get(protect, validateRequest(getTenantsSchema), getTenants)
  .post(
    protect,
    requireSuperadmin,
    upload.single("aadharImage"),
    validateRequest(createTenantSchema),
    createTenant,
  );

router
  .route("/:id")
  .get(protect, validateRequest(tenantIdParamSchema), getTenant)
  .put(
    protect,
    requireSuperadmin,
    upload.single("aadharImage"),
    validateRequest(updateTenantSchema),
    updateTenant,
  );

router.post(
  "/:id/change",
  protect,
  requireSuperadmin,
  upload.single("aadharImage"),
  validateRequest(changeTenantSchema),
  changeTenant,
);

router
  .route("/:id/rent")
  .get(protect, validateRequest(tenantIdParamSchema), getRentHistoryForTenant)
  .post(
    protect,
    requireSuperadmin,
    validateRequest(addRentRecordSchema),
    addRentRecord,
  );

module.exports = router;
