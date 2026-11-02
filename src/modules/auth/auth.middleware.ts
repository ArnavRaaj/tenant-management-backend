import type { NextFunction, Request, Response } from "express";
import { CacheKeys, cached } from "../../core/cache/cache";
import { ErrorCode, UnauthorizedError } from "../../core/errors/AppError";
import { getRequestContext } from "../../core/requestContext";
import { verifyAccessToken } from "../../core/security/jwt";
import { permissionsFor, type Role } from "../../core/security/permissions";
import { organizationIdOf } from "../users/user.model";
import { userRepository } from "../users/user.repository";

interface CachedAuthUser {
  role: Role;
  organizationId: string;
  tokenVersion: number;
  isActive: boolean;
  email: string;
  name: string;
}

const AUTH_CACHE_TTL_SECONDS = 60;

const loadAuthUser = (userId: string) =>
  cached<CachedAuthUser | null>(
    CacheKeys.authUser(userId),
    AUTH_CACHE_TTL_SECONDS,
    async () => {
      const user = await userRepository.findById(userId);
      if (!user) return null;
      return {
        role: user.role,
        organizationId: organizationIdOf(user),
        tokenVersion: user.tokenVersion,
        isActive: user.isActive,
        email: user.email,
        name: user.name,
      };
    },
  );

/**
 * Verifies the Bearer access token and builds `req.auth`.
 * The organisation id ALWAYS comes from the server-side user record,
 * never from client input. Revocation is enforced via tokenVersion.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw new UnauthorizedError("Authentication required");

    const verified = verifyAccessToken(token);
    if (!verified.ok) {
      throw verified.reason === "expired"
        ? new UnauthorizedError("Access token expired", ErrorCode.TOKEN_EXPIRED)
        : new UnauthorizedError("Invalid access token");
    }
    const { claims } = verified;

    const user = await loadAuthUser(claims.sub);
    if (
      !user ||
      !user.isActive ||
      user.tokenVersion !== claims.tv ||
      user.role !== claims.role ||
      user.organizationId !== claims.org
    ) {
      throw new UnauthorizedError(
        "Session is no longer valid. Please sign in again.",
      );
    }

    req.auth = {
      userId: claims.sub,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
      name: user.name,
      permissions: permissionsFor(user.role),
    };
    const ctx = getRequestContext();
    if (ctx) {
      ctx.userId = claims.sub;
      ctx.organizationId = user.organizationId;
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Narrows `req.auth` for controllers behind `authenticate`. */
export const requireAuth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
