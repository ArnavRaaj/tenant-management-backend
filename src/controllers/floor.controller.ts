import { Request } from "express";
import { getFloorsService, createFloorService } from "../service/floor.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get all floors from database
// @route   GET /api/floors or GET /api/flats/meta/floors
// @access  Private
exports.getFloors = asyncHandler(async (_req: Request) => {
  return await getFloorsService();
});

// @desc    Add new floor dynamically
// @route   POST /api/floors
// @access  Private (Superadmin)
exports.createFloor = asyncHandler(async (req: Request) => {
  return await createFloorService(req);
});
