import crypto from "crypto";
import { config } from "../../config/env";
import { CacheKeys, cacheDel } from "../../core/cache/cache";
import {
  ConflictError,
  ErrorCode,
  ForbiddenError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
} from "../../core/errors/AppError";
import { logger } from "../../core/logger";
import { RateLimits, createLimiter } from "../../core/middleware/rateLimit";
import { recordAuditChange } from "../../core/requestContext";
import {
  generateOtp,
  generateToken,
  hashOtp,
  safeEqual,
} from "../../core/security/crypto";
import { signAccessToken } from "../../core/security/jwt";
import {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from "../../core/security/password";
import {
  permissionsFor,
  type Permission,
} from "../../core/security/permissions";
import { sendEmail } from "../notifications/email.service";
import { otpEmail, welcomeEmail } from "../notifications/email.templates";
import {
  organizationIdOf,
  toPublicUser,
  type OtpState,
  type PublicUser,
  type UserDoc,
} from "../users/user.model";
import { userRepository } from "../users/user.repository";
import { RefreshToken, type RevokeReason } from "./refreshToken.model";

export interface ClientMeta {
  ip: string;
  userAgent: string;
}

export interface SessionUser extends PublicUser {
  permissions: Permission[];
}

export interface Session {
  user: SessionUser;
  accessToken: string;
  expiresIn: number;
  /** Raw refresh token — set as an httpOnly cookie by the controller, never in JSON. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

type OtpKind = "emailVerification" | "passwordReset";

const OTP_RESEND_COOLDOWN_MS = 60_000;
const REFRESH_REUSE_GRACE_MS = 30_000;
const loginFailures = createLimiter(RateLimits.loginFailures);

const GENERIC_OTP_SENT =
  "If an account exists for this email, a verification code has been sent.";

// ── Helpers ───────────────────────────────────────────────────────────────
const hashRefreshToken = (token: string): string =>
  crypto
    .createHmac("sha256", config.auth.refreshSecret)
    .update(token)
    .digest("hex");

export const toSessionUser = (user: UserDoc): SessionUser => ({
  ...toPublicUser(user),
  permissions: [...permissionsFor(user.role)],
});

const issueRefreshToken = async (
  user: UserDoc,
  meta: ClientMeta,
  familyId: string = crypto.randomUUID(),
) => {
  const token = generateToken(48);
  const expiresAt = new Date(
    Date.now() + config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  );
  await RefreshToken.create({
    tokenHash: hashRefreshToken(token),
    userId: user._id,
    familyId,
    tokenVersion: user.tokenVersion,
    expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent.slice(0, 512),
  });
  return { token, expiresAt };
};

const createSession = async (
  user: UserDoc,
  meta: ClientMeta,
  familyId?: string,
): Promise<Session> => {
  const accessToken = signAccessToken({
    sub: user._id.toHexString(),
    org: organizationIdOf(user),
    role: user.role,
    tv: user.tokenVersion,
  });
  const refresh = await issueRefreshToken(user, meta, familyId);
  return {
    user: toSessionUser(user),
    accessToken,
    expiresIn: config.auth.accessTokenTtlSeconds,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
};

const revokeFamily = (familyId: string, reason: RevokeReason) =>
  RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );

/** Revokes every session of a user (password change, deactivation, logout-all). */
export const revokeAllSessions = async (userId: string): Promise<void> => {
  await userRepository.updateById(userId, { $inc: { tokenVersion: 1 } });
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "revoked_all" } },
  );
  await cacheDel(CacheKeys.authUser(userId));
};

const issueOtp = async (user: UserDoc, kind: OtpKind): Promise<void> => {
  const existing = user[kind];
  if (
    existing?.lastSentAt &&
    Date.now() - new Date(existing.lastSentAt).getTime() <
      OTP_RESEND_COOLDOWN_MS
  ) {
    throw new TooManyRequestsError(
      Math.ceil(
        (OTP_RESEND_COOLDOWN_MS -
          (Date.now() - new Date(existing.lastSentAt).getTime())) /
          1000,
      ),
      "Please wait before requesting another code",
    );
  }
  const otp = generateOtp();
  const state: OtpState = {
    otpHash: hashOtp(otp, `${kind}:${user._id.toHexString()}`),
    expiresAt: new Date(Date.now() + config.auth.otpTtlMinutes * 60_000),
    attempts: 0,
    lastSentAt: new Date(),
  };
  await userRepository.updateById(user._id.toHexString(), {
    $set: { [kind]: state },
  });
  await sendEmail(
    user.email,
    otpEmail(
      otp,
      kind === "emailVerification" ? "verification" : "password_reset",
      config.auth.otpTtlMinutes,
    ),
  );
};

/**
 * Verifies an OTP with an attempt counter. The counter is incremented
 * atomically *before* comparison so parallel guesses cannot exceed the limit.
 */
const consumeOtpAttempt = async (
  user: UserDoc,
  kind: OtpKind,
  otp: string,
): Promise<void> => {
  const state = user[kind];
  if (!state?.otpHash) {
    throw new UnprocessableError(
      "Invalid or expired code",
      ErrorCode.INVALID_OTP,
    );
  }
  if (new Date(state.expiresAt).getTime() < Date.now()) {
    throw new UnprocessableError(
      "Code has expired. Request a new one.",
      ErrorCode.OTP_EXPIRED,
    );
  }
  const updated = await userRepository.updateWhere(
    {
      _id: user._id,
      [`${kind}.otpHash`]: state.otpHash,
      [`${kind}.attempts`]: { $lt: config.auth.otpMaxAttempts },
    },
    { $inc: { [`${kind}.attempts`]: 1 } },
  );
  if (!updated) {
    // Too many attempts → burn the code entirely.
    await userRepository.updateById(user._id.toHexString(), {
      $set: { [kind]: null },
    });
    throw new TooManyRequestsError(
      0,
      "Too many incorrect attempts. Request a new code.",
    );
  }
  const expected = hashOtp(otp, `${kind}:${user._id.toHexString()}`);
  if (!safeEqual(expected, state.otpHash)) {
    throw new UnprocessableError(
      "Invalid or incorrect code",
      ErrorCode.INVALID_OTP,
    );
  }
};

// ── Registration & verification ──────────────────────────────────────────
export const register = async (input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ message: string; email: string }> => {
  const existing = await userRepository.findByEmail(input.email);
  if (existing) {
    throw new ConflictError(
      "An account with this email already exists",
      ErrorCode.DUPLICATE_RESOURCE,
    );
  }
  const user = await userRepository.create({
    name: input.name,
    email: input.email,
    password: await hashPassword(input.password),
    role: "superadmin",
    superadminId: null,
    isVerified: false,
  });
  recordAuditChange({ resourceId: user._id.toHexString() });
  await issueOtp(user, "emailVerification");
  return {
    message: "Signup successful. Verify your email with the code we sent.",
    email: user.email,
  };
};

export const resendVerification = async (email: string) => {
  const user = await userRepository.findByEmailWithSecrets(email);
  if (user && !user.isVerified) await issueOtp(user, "emailVerification");
  return { message: GENERIC_OTP_SENT };
};

export const verifyEmail = async (
  input: { email: string; otp: string },
  meta: ClientMeta,
): Promise<Session> => {
  const user = await userRepository.findByEmailWithSecrets(input.email);
  if (!user || user.isVerified) {
    throw new UnprocessableError(
      "Invalid or incorrect code",
      ErrorCode.INVALID_OTP,
    );
  }
  await consumeOtpAttempt(user, "emailVerification", input.otp);
  const verified = await userRepository.updateById(user._id.toHexString(), {
    $set: {
      isVerified: true,
      emailVerification: null,
      lastLoginAt: new Date(),
    },
  });
  if (!verified) throw new UnauthorizedError();
  recordAuditChange({ resourceId: user._id.toHexString() });
  await sendEmail(verified.email, welcomeEmail(verified.name));
  return createSession(verified, meta);
};

// ── Login / sessions ─────────────────────────────────────────────────────
export const login = async (
  input: { email: string; password: string },
  meta: ClientMeta,
): Promise<Session> => {
  const failureKey = `${input.email.toLowerCase()}:${meta.ip}`;
  await loginFailures.assertNotBlocked(failureKey);

  const user = await userRepository.findByEmailWithSecrets(input.email);
  const passwordOk = user?.password
    ? await verifyPassword(input.password, user.password)
    : await burnPasswordCheck(input.password); // constant-ish timing

  if (!user || !passwordOk) {
    await loginFailures.consume(failureKey);
    throw new UnauthorizedError(
      "Invalid email or password",
      ErrorCode.INVALID_CREDENTIALS,
    );
  }
  if (!user.isActive) {
    throw new ForbiddenError(
      "This account has been deactivated",
      ErrorCode.ACCOUNT_DISABLED,
    );
  }
  if (!user.isVerified) {
    throw new ForbiddenError(
      "Email not verified. Please verify your account.",
      ErrorCode.EMAIL_NOT_VERIFIED,
    );
  }
  await loginFailures.reset(failureKey);
  await userRepository.updateById(user._id.toHexString(), {
    $set: { lastLoginAt: new Date() },
  });
  recordAuditChange({ resourceId: user._id.toHexString() });
  return createSession(user, meta);
};

/**
 * Rotates a refresh token. Each token is single-use; presenting a rotated
 * token again (outside a short grace window for concurrent tabs) signals
 * theft, and the entire token family is revoked.
 */
export const refreshSession = async (
  rawToken: string | undefined,
  meta: ClientMeta,
): Promise<Session> => {
  if (!rawToken) throw new UnauthorizedError("No active session");
  const tokenHash = hashRefreshToken(rawToken);

  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date(), revokedReason: "rotated" } },
    { returnDocument: "before" },
  ).lean();

  let familyId: string;
  let userId: string;
  let tokenVersion: number;

  if (claimed) {
    familyId = claimed.familyId;
    userId = claimed.userId.toHexString();
    tokenVersion = claimed.tokenVersion;
  } else {
    const previous = await RefreshToken.findOne({ tokenHash }).lean();
    const inGrace =
      previous?.revokedReason === "rotated" &&
      previous.revokedAt &&
      Date.now() - previous.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS &&
      previous.expiresAt.getTime() > Date.now();
    if (!previous || !inGrace) {
      if (previous && previous.revokedReason === "rotated") {
        await revokeFamily(previous.familyId, "reuse_detected");
        logger.warn(
          {
            userId: previous.userId.toHexString(),
            familyId: previous.familyId,
          },
          "Refresh token reuse detected — session family revoked",
        );
      }
      throw new UnauthorizedError("Session expired. Please sign in again.");
    }
    familyId = previous.familyId;
    userId = previous.userId.toHexString();
    tokenVersion = previous.tokenVersion;
  }

  const user = await userRepository.findById(userId);
  if (!user || !user.isActive || user.tokenVersion !== tokenVersion) {
    await revokeFamily(familyId, "revoked_all");
    throw new UnauthorizedError("Session expired. Please sign in again.");
  }
  return createSession(user, meta, familyId);
};

export const logout = async (rawToken: string | undefined): Promise<void> => {
  if (!rawToken) return;
  const token = await RefreshToken.findOne({
    tokenHash: hashRefreshToken(rawToken),
  }).lean();
  if (token) {
    await revokeFamily(token.familyId, "logout");
    recordAuditChange({ resourceId: token.userId.toHexString() });
  }
};

export const getProfile = async (userId: string): Promise<SessionUser> => {
  const user = await userRepository.findById(userId);
  if (!user) throw new UnauthorizedError();
  return toSessionUser(user);
};

// ── Password reset ───────────────────────────────────────────────────────
export const requestPasswordReset = async (email: string) => {
  const user = await userRepository.findByEmailWithSecrets(email);
  // Same response whether or not the account exists (no user enumeration).
  if (user && user.isActive && user.isVerified) {
    await issueOtp(user, "passwordReset");
  }
  return { message: GENERIC_OTP_SENT };
};

export const verifyPasswordResetOtp = async (input: {
  email: string;
  otp: string;
}) => {
  const user = await userRepository.findByEmailWithSecrets(input.email);
  if (!user) {
    throw new UnprocessableError(
      "Invalid or incorrect code",
      ErrorCode.INVALID_OTP,
    );
  }
  await consumeOtpAttempt(user, "passwordReset", input.otp);
  return { message: "Code verified", valid: true };
};

export const resetPassword = async (input: {
  email: string;
  otp: string;
  password: string;
}) => {
  const user = await userRepository.findByEmailWithSecrets(input.email);
  if (!user) {
    throw new UnprocessableError(
      "Invalid or incorrect code",
      ErrorCode.INVALID_OTP,
    );
  }
  await consumeOtpAttempt(user, "passwordReset", input.otp);
  await userRepository.updateById(user._id.toHexString(), {
    $set: {
      password: await hashPassword(input.password),
      passwordReset: null,
      passwordChangedAt: new Date(),
    },
  });
  // A password reset signs the user out everywhere.
  await revokeAllSessions(user._id.toHexString());
  recordAuditChange({ resourceId: user._id.toHexString() });
  return {
    message:
      "Password updated successfully. You can now log in with your new password.",
  };
};
