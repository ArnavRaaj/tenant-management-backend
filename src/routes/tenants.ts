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
const { protect } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");
const { validateRequest } = require("../middlewares/validationMiddleware");
import {
  getTenantsSchema,
  createTenantSchema,
  updateTenantSchema,
  changeTenantSchema,
  tenantIdParamSchema,
  addRentRecordSchema,
} from "../validations/tenant.validation";

router
  .route("/")
  .get(protect, validateRequest(getTenantsSchema), getTenants)
  .post(
    protect,
    upload.single("aadharImage"),
    validateRequest(createTenantSchema),
    createTenant,
  );

router
  .route("/:id")
  .get(protect, validateRequest(tenantIdParamSchema), getTenant)
  .put(
    protect,
    upload.single("aadharImage"),
    validateRequest(updateTenantSchema),
    updateTenant,
  );

router.post(
  "/:id/change",
  protect,
  upload.single("aadharImage"),
  validateRequest(changeTenantSchema),
  changeTenant,
);

router
  .route("/:id/rent")
  .get(protect, validateRequest(tenantIdParamSchema), getRentHistoryForTenant)
  .post(protect, validateRequest(addRentRecordSchema), addRentRecord);

module.exports = router;
