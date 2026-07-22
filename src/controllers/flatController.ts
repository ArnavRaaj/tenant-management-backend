import { Request } from "express";
import {
  getFlatService,
  createFlatService,
  deleteFlatService,
  getFlatListService,
  getFlatRevenueService,
  getFlatTenantHistoryService,
  getFlatVacantHistoryService,
} from "../service/flat.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get all flats — supports ?status=vacant|occupied
// @route   GET /api/flats
exports.getFlats = asyncHandler(async (req: Request) => {
  return await getFlatListService(req);
});

// @desc    Get single flat
// @route   GET /api/flats/:id
exports.getFlat = asyncHandler(async (req: Request) => {
  return await getFlatService(req);
});

// @desc    Create a flat (floor-wise)
// @route   POST /api/flats
exports.createFlat = asyncHandler(async (req: Request) => {
  return await createFlatService(req);
});

// @desc    Delete a flat (only if unoccupied)
// @route   DELETE /api/flats/:id
exports.deleteFlat = asyncHandler(async (req: Request) => {
  return await deleteFlatService(req);
});

// @desc    Get all tenants (past + current) who ever lived in this flat
// @route   GET /api/flats/:id/tenants
exports.getFlatTenantHistory = asyncHandler(async (req: Request) => {
  return await getFlatTenantHistoryService(req);
});

// @desc    Get total revenue + monthly breakdown for a flat
// @route   GET /api/flats/:id/revenue
exports.getFlatRevenue = asyncHandler(async (req: Request) => {
  return await getFlatRevenueService(req);
});

// @desc    Get vacancy periods for a flat (gaps between tenants)
// @route   GET /api/flats/:id/vacant-history
exports.getFlatVacantHistory = asyncHandler(async (req: Request) => {
  return await getFlatVacantHistoryService(req);
});
