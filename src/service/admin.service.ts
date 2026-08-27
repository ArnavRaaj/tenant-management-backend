import { Request } from "express";
import * as crypto from "crypto";
import { AppError } from "../utils/AppError";
import {
  createUser,
  findUserByEmail,
  findUserByInviteToken,
  saveUserDoc,
} from "../repository/user.repository";

const User = require("../models/User");

export const inviteAdminService = async (req: Request) => {
  const { name, email } = req.body;
  const superadminId = (req as any).organizationId;

  if (!name || !email) {
    throw new AppError("Name and email are required to invite an admin", 400);
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new AppError("A user with this email already exists", 400);
  }

  // Generate a secure invite token
  const inviteToken = crypto.randomBytes(32).toString("hex");

  // Create user as 'admin' under the current superadmin
  const user = await createUser(
    name,
    email,
    undefined, // password will be set on accept
    "admin",
    superadminId,
    false, // isVerified
    inviteToken,
  );

  const inviteLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/accept-invitation?email=${encodeURIComponent(email)}&token=${inviteToken}`;

  console.log("\n===========================================");
  console.log(`✉️ [ADMIN INVITATION LINK]`);
  console.log(`📧 Sent to: ${email}`);
  console.log(`🔗 Link: ${inviteLink}`);
  console.log("===========================================\n");

  return { message: "Invitation sent successfully", inviteLink };
};

export const acceptInvitationService = async (req: Request) => {
  const { email, token, password, confirmPassword } = req.body;

  if (!email || !token || !password || !confirmPassword) {
    throw new AppError("All fields are required", 400);
  }

  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match", 400);
  }

  const user = await findUserByInviteToken(token);

  if (!user || user.email !== email) {
    throw new AppError("Invalid or expired invitation token", 400);
  }

  user.password = password;
  user.isVerified = true;
  user.inviteToken = undefined;

  await saveUserDoc(user);

  return { message: "Password set successfully. You can now log in." };
};

export const getAdminsService = async (req: Request) => {
  const superadminId = (req as any).organizationId;
  const admins = await User.find({ superadminId, role: "admin" }).select(
    "-password -__v",
  );
  return admins;
};
