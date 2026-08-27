const User = require("../models/User");

export const createUser = async (
  name: string,
  email: string,
  password?: string,
  role?: string,
  superadminId?: string | null,
  isVerified?: boolean,
  inviteToken?: string | null,
) => {
  return await User.create({
    name,
    email,
    password,
    role: role || "superadmin",
    superadminId: superadminId || null,
    isVerified: isVerified !== undefined ? isVerified : false,
    inviteToken: inviteToken || null,
  });
};

export const findUserByEmail = async (email: string) => {
  return await User.findOne({ email });
};

export const findOneUserByEmail = async (email: string) => {
  return await User.findOne({ email }).select("+password");
};

export const findUserByEmailWithOtp = async (email: string) => {
  return await User.findOne({ email }).select(
    "+resetPasswordOtp +resetPasswordOtpExpire +password",
  );
};

export const findUserByEmailWithEmailVerificationOtp = async (
  email: string,
) => {
  return await User.findOne({ email }).select(
    "+emailVerificationOtp +emailVerificationOtpExpire +password",
  );
};

export const findUserByInviteToken = async (inviteToken: string) => {
  return await User.findOne({ inviteToken }).select("+password");
};

export const saveUserDoc = async (user: any) => {
  return await user.save();
};
