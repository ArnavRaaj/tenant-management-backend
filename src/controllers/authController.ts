import { Request, Response } from "express";
import {
  getMeService,
  loginUserService,
  registerUserService,
} from "../service/user.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = asyncHandler(async (req: Request, res: Response) => {
  return await registerUserService(req, res);
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
exports.loginUser = asyncHandler(async (req: Request, res: Response) => {
  return await loginUserService(req, res);
});

// @desc    Get user data
// @route   GET /api/auth/me
exports.getMe = asyncHandler(async (req: any, res: Response) => {
  return await getMeService(req, res);
});
