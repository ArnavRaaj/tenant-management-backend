import { Request } from "express";
import {
  createUser,
  findOneUserByEmail,
  findUserByEmail,
  findUserByEmailWithOtp,
  findUserByEmailWithEmailVerificationOtp,
  saveUserDoc,
} from "../repository/user.repository";
import { AppError } from "../utils/AppError";

const { generateToken } = require("../utils/helpers");

const generateEmailVerificationOtp = async (user: any) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.emailVerificationOtp = otp;
  user.emailVerificationOtpExpire = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  await saveUserDoc(user);

  console.log("\n===========================================");
  console.log(`✉️ [EMAIL VERIFICATION OTP SENT]`);
  console.log(`📧 Email: ${user.email}`);
  console.log(`🔢 OTP:   ${otp}`);
  console.log("===========================================\n");

  return otp;
};

export const registerUserService = async (req: Request) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError("Please add all fields", 400);
  }

  const userExists = await findUserByEmail(email);

  if (userExists) {
    throw new AppError("User already exists", 400);
  }

  const user = await createUser(
    name,
    email,
    password,
    "superadmin",
    null,
    false,
    null,
  );

  await generateEmailVerificationOtp(user);

  return {
    message: "Signup successful. Please verify your email with the OTP sent.",
  };
};

export const verifyEmailService = async (req: Request) => {
  const { email, otp } = req.body;
  const user = await findUserByEmailWithEmailVerificationOtp(email);

  if (
    !user ||
    !user.emailVerificationOtp ||
    user.emailVerificationOtp !== otp
  ) {
    throw new AppError("Invalid or incorrect OTP", 400);
  }

  if (new Date(user.emailVerificationOtpExpire) < new Date()) {
    throw new AppError("OTP has expired. Please request a new one.", 400);
  }

  user.isVerified = true;
  user.emailVerificationOtp = undefined;
  user.emailVerificationOtpExpire = undefined;
  await saveUserDoc(user);

  return {
    _id: user.id,
    name: user.name,
    email: user.email,
    token: generateToken(user._id),
    role: user.role,
  };
};

export const loginUserService = async (req: Request) => {
  const { email, password } = req.body;

  const user = await findOneUserByEmail(email);

  if (user && (await user.matchPassword(password))) {
    if (!user.isVerified) {
      throw new AppError(
        "Email not verified. Please verify your account.",
        403,
      );
    }
    return {
      _id: user.id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
      role: user.role,
    };
  } else {
    throw new AppError("Invalid credentials", 401);
  }
};

export const getMeService = async (req: any) => {
  return req.user;
};

// ======================== FORGOT PASSWORD FLOW ========================

const generateAndSaveOtp = async (user: any, isResend: boolean = false) => {
  // Generate a random 6-digit number
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set OTP and expiration time (15 minutes from now)
  user.resetPasswordOtp = otp;
  user.resetPasswordOtpExpire = new Date(Date.now() + 15 * 60 * 1000);
  await saveUserDoc(user);

  // Print clearly in terminal console as requested
  console.log("\n===========================================");
  console.log(
    isResend
      ? `🔄 [PASSWORD RESET OTP RE-SENT]`
      : `🔑 [PASSWORD RESET OTP SENT]`,
  );
  console.log(`📧 Email: ${user.email}`);
  console.log(`🔢 OTP:   ${otp}`);
  console.log("===========================================\n");

  return otp;
};

export const sendOtpService = async (req: Request) => {
  const { email } = req.body;
  const user = await findUserByEmailWithOtp(email);

  if (!user) {
    throw new AppError(
      "No registered account found with that email address",
      404,
    );
  }

  await generateAndSaveOtp(user, false);
  return { message: "OTP has been generated and sent successfully" };
};

export const resendOtpService = async (req: Request) => {
  const { email } = req.body;
  const user = await findUserByEmailWithOtp(email);

  if (!user) {
    throw new AppError(
      "No registered account found with that email address",
      404,
    );
  }

  await generateAndSaveOtp(user, true);
  return { message: "A new OTP has been generated and sent successfully" };
};

export const verifyOtpService = async (req: Request) => {
  const { email, otp } = req.body;
  const user = await findUserByEmailWithOtp(email);

  if (!user || !user.resetPasswordOtp || user.resetPasswordOtp !== otp) {
    throw new AppError("Invalid or incorrect OTP", 400);
  }

  if (new Date(user.resetPasswordOtpExpire) < new Date()) {
    throw new AppError(
      "OTP has expired. Please resend or request a new OTP.",
      400,
    );
  }

  return { message: "OTP verified successfully", valid: true };
};

export const resetPasswordService = async (req: Request) => {
  const { email, otp, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    throw new AppError("Password and confirm password do not match", 400);
  }

  const user = await findUserByEmailWithOtp(email);

  // Re-verify OTP as a strict security measure before changing password
  if (!user || !user.resetPasswordOtp || user.resetPasswordOtp !== otp) {
    throw new AppError("Invalid OTP authorization for password reset", 400);
  }

  if (new Date(user.resetPasswordOtpExpire) < new Date()) {
    throw new AppError("OTP authorization expired. Please start over.", 400);
  }

  // Assign new password (will automatically trigger bcrypt hashing on save)
  user.password = password;
  user.resetPasswordOtp = undefined;
  user.resetPasswordOtpExpire = undefined;

  await saveUserDoc(user);

  return {
    message:
      "Password updated successfully. You can now log in with your new password.",
  };
};
