import { Request } from "express";
import {
  getMeService,
  loginUserService,
  registerUserService,
} from "../service/user.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = asyncHandler(async (req: Request) => {
  return await registerUserService(req);
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
exports.loginUser = asyncHandler(async (req: Request) => {
  return await loginUserService(req);
});

// @desc    Get user data
// @route   GET /api/auth/me
exports.getMe = asyncHandler(async (req: any) => {
  return await getMeService(req);
});
