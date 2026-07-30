const express = require("express");
const router = express.Router();
const {
  getAddresses,
  createAddress,
} = require("../controllers/address.controller");
import {
  createAddressSchema,
  getAddressesSchema,
} from "../validations/address.validation";
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
const { validateRequest } = require("../middlewares/validationMiddleware");

router
  .route("/")
  .get(protect, getAddresses)
  .post(
    protect,
    requireSuperadmin,
    validateRequest(createAddressSchema),
    createAddress,
  );

module.exports = router;
