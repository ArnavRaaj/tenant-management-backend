import { Request } from "express";
import {
  getTenantService,
  getTenantsService,
  createTenantService,
  updateTenantService,
  changeTenantService,
  vacateTenantService,
  addRentRecordService,
  getRentHistoryForTenantService,
} from "../service/tenant.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get all active tenants
// @route   GET /api/tenants
exports.getTenants = asyncHandler(async (req: Request) => {
  return await getTenantsService(req);
});

// @desc    Get single tenant
// @route   GET /api/tenants/:id
exports.getTenant = asyncHandler(async (req: Request) => {
  return await getTenantService(req);
});

// @desc    Assign flat to new tenant
// @route   POST /api/tenants
exports.createTenant = asyncHandler(async (req: any) => {
  return await createTenantService(req);
});

// @desc    Update tenant details
// @route   PUT /api/tenants/:id
exports.updateTenant = asyncHandler(async (req: any) => {
  return await updateTenantService(req);
});

// @desc    Change tenant (Move out current, assign new)
// @route   POST /api/tenants/:id/change
exports.changeTenant = asyncHandler(async (req: Request) => {
  return await changeTenantService(req);
});

// @desc    Vacate tenant (Move out current, leave flat vacant)
// @route   POST /api/tenants/:id/vacate
exports.vacateTenant = asyncHandler(async (req: Request) => {
  return await vacateTenantService(req);
});

// @desc    Add a rent payment record
// @route   POST /api/tenants/:id/rent
exports.addRentRecord = asyncHandler(async (req: Request) => {
  return await addRentRecordService(req);
});

// @desc    Get rent history for a tenant
// @route   GET /api/tenants/:id/rent
exports.getRentHistoryForTenant = asyncHandler(async (req: Request) => {
  return await getRentHistoryForTenantService(req);
});

// @desc    Get or generate tenant onboarding KYC link
// @route   GET /api/tenants/:id/kyc-link
exports.getTenantKycLink = asyncHandler(async (req: Request) => {
  const { getTenantKycLinkService } = require("../service/tenant.service");
  return await getTenantKycLinkService(req);
});
