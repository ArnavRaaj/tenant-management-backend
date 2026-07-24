import { Request } from "express";
import {
  createAddressService,
  getAddressesService,
} from "../service/address.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Get all addresses for logged-in user
// @route   GET /api/addresses
exports.getAddresses = asyncHandler(async (req: Request) => {
  return await getAddressesService(req);
});

// @desc    Create a new address
// @route   POST /api/addresses
exports.createAddress = asyncHandler(async (req: Request) => {
  return await createAddressService(req);
});
