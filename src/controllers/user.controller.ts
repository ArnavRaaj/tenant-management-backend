import { Request, Response, NextFunction } from "express";
import {
  inviteAdminService,
  acceptInvitationService,
  getAdminsService,
} from "../service/admin.service";

// Use require for helpers to match the rest of the codebase pattern if needed,
// or use import if it is exported as ES module. helpers.ts uses module.exports = { ... }
const { asyncHandler } = require("../utils/helpers");

// @desc    Invite a new admin (Superadmin only)
// @route   POST /api/users/invite
export const inviteAdmin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  return await inviteAdminService(req);
});

// @desc    Accept invitation and set password
// @route   POST /api/users/accept-invitation
export const acceptInvitation = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  return await acceptInvitationService(req);
});

// @desc    Get all admins under superadmin
// @route   GET /api/users
export const getAdmins = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  return await getAdminsService(req);
});
