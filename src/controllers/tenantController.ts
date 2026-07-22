import { Request, Response } from "express";
import {
  getTenantService,
  getTenantsService,
  createTenantService,
  updateTenantService,
  changeTenantService,
  addRentRecordService,
  getRentHistoryForTenantService,
} from "../service/tenant.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get all active tenants
// @route   GET /api/tenants
exports.getTenants = asyncHandler(async (req: Request, res: Response) => {
  return await getTenantsService(req, res);
});

// @desc    Get single tenant
// @route   GET /api/tenants/:id
exports.getTenant = asyncHandler(async (req: Request, res: Response) => {
  return await getTenantService(req, res);
});

// @desc    Assign flat to new tenant
// @route   POST /api/tenants
exports.createTenant = asyncHandler(async (req: any, res: Response) => {
  return await createTenantService(req, res);
});

// @desc    Update tenant details
// @route   PUT /api/tenants/:id
exports.updateTenant = asyncHandler(async (req: any, res: Response) => {
  return await updateTenantService(req, res);
});

// @desc    Change tenant (Move out current, assign new)
// @route   POST /api/tenants/:id/change
exports.changeTenant = asyncHandler(async (req: Request, res: Response) => {
  return await changeTenantService(req, res);
});

// @desc    Add a rent payment record
// @route   POST /api/tenants/:id/rent
exports.addRentRecord = asyncHandler(async (req: Request, res: Response) => {
  return await addRentRecordService(req, res);
});

// @desc    Get rent history for a tenant
// @route   GET /api/tenants/:id/rent
exports.getRentHistoryForTenant = asyncHandler(
  async (req: Request, res: Response) => {
    return await getRentHistoryForTenantService(req, res);
  },
);
