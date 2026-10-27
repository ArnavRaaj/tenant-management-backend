const express = require("express");
const router = express.Router();
const { getFloors, createFloor } = require("../controllers/floor.controller");
const { protect } = require("../middlewares/authMiddleware");
import { requireSuperadmin } from "../middlewares/roleMiddleware";
import { validateRequest } from "../middlewares/validationMiddleware";
import { createFloorSchema } from "../validations/floor.validation";

router
  .route("/")
  .get(protect, getFloors)
  .post(
    protect,
    requireSuperadmin,
    validateRequest(createFloorSchema),
    createFloor,
  );

export default router;
