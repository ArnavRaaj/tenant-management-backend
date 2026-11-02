import { config } from "../../config/env";
import { toObjectId } from "../../core/db/objectId";
import { pageMeta, toSkip, type PageQuery } from "../../core/db/pagination";
import {
  ConflictError,
  ErrorCode,
  NotFoundError,
  UnprocessableError,
} from "../../core/errors/AppError";
import { recordAuditChange } from "../../core/requestContext";
import {
  generateToken,
  hashToken,
  safeEqual,
} from "../../core/security/crypto";
import { hashPassword } from "../../core/security/password";
import type { AuthContext } from "../../types/express";
import { revokeAllSessions } from "../auth/auth.service";
import { sendEmail } from "../notifications/email.service";
import { adminInviteEmail } from "../notifications/email.templates";
import { toPublicUser } from "./user.model";
import { userRepository } from "./user.repository";

export const inviteAdmin = async (
  auth: AuthContext,
  input: { name: string; email: string },
) => {
  if (await userRepository.findByEmail(input.email)) {
    throw new ConflictError(
      "A user with this email already exists",
      ErrorCode.DUPLICATE_RESOURCE,
    );
  }
  const token = generateToken(32);
  const expiresAt = new Date(
    Date.now() + config.auth.inviteTtlDays * 86_400_000,
  );
  const user = await userRepository.create({
    name: input.name,
    email: input.email,
    role: "admin",
    superadminId: toObjectId(auth.organizationId),
    isVerified: false,
    // Only the hash is stored; the raw token exists only in the emailed link.
    invite: { tokenHash: hashToken(token), expiresAt },
  });

  const inviteLink = `${config.frontendUrl}/accept-invitation?email=${encodeURIComponent(
    user.email,
  )}&token=${token}`;
  await sendEmail(
    user.email,
    adminInviteEmail(inviteLink, auth.name, config.auth.inviteTtlDays),
  );
  recordAuditChange({
    resourceId: user._id.toHexString(),
    after: { name: user.name, email: user.email, role: user.role },
  });
  return {
    message: "Invitation sent successfully",
    user: toPublicUser(user),
    // Returned so the inviting superadmin can share it manually if email fails.
    inviteLink,
    expiresAt,
  };
};

export const acceptInvitation = async (input: {
  email: string;
  token: string;
  password: string;
}) => {
  const user = await userRepository.findByInviteTokenHash(
    hashToken(input.token),
  );
  const invite = user?.invite;
  if (
    !user ||
    !invite ||
    !safeEqual(user.email, input.email.toLowerCase()) ||
    new Date(invite.expiresAt).getTime() < Date.now()
  ) {
    throw new UnprocessableError("This invitation is invalid or has expired");
  }
  await userRepository.updateById(user._id.toHexString(), {
    $set: {
      password: await hashPassword(input.password),
      isVerified: true,
      invite: null,
      passwordChangedAt: new Date(),
    },
  });
  recordAuditChange({ resourceId: user._id.toHexString() });
  return { message: "Password set successfully. You can now log in." };
};

export const listAdmins = async (auth: AuthContext, page: PageQuery) => {
  const [admins, total] = await Promise.all([
    userRepository.listAdmins(auth.organizationId, toSkip(page), page.limit),
    userRepository.countAdmins(auth.organizationId),
  ]);
  return { items: admins.map(toPublicUser), meta: pageMeta(page, total) };
};

/** Deactivating an admin immediately revokes all of their sessions. */
export const setAdminStatus = async (
  auth: AuthContext,
  adminId: string,
  isActive: boolean,
) => {
  const admin = await userRepository.findAdminInOrg(
    adminId,
    auth.organizationId,
  );
  if (!admin) throw new NotFoundError("Admin not found");

  const updated = await userRepository.updateById(adminId, {
    $set: { isActive },
  });
  if (!updated) throw new NotFoundError("Admin not found");
  if (!isActive) await revokeAllSessions(adminId);

  recordAuditChange({
    resourceId: adminId,
    before: { isActive: admin.isActive },
    after: { isActive: updated.isActive },
  });
  return toPublicUser(updated);
};
