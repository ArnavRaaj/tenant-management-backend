import jwt from "jsonwebtoken";
import { config } from "../../config/env";
import { isRole, type Role } from "./permissions";

export interface AccessTokenClaims {
  sub: string;
  org: string;
  role: Role;
  tv: number; // token version — bumping it on the user revokes all access tokens
}

export const signAccessToken = (claims: AccessTokenClaims): string =>
  jwt.sign(claims, config.auth.accessSecret, {
    algorithm: "HS256",
    expiresIn: config.auth.accessTokenTtlSeconds,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
  });

export type VerifyResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: "expired" | "invalid" };

export const verifyAccessToken = (token: string): VerifyResult => {
  try {
    const decoded = jwt.verify(token, config.auth.accessSecret, {
      algorithms: ["HS256"], // pinned: rejects "none" and algorithm confusion
      issuer: config.auth.issuer,
      audience: config.auth.audience,
    });
    if (
      typeof decoded !== "object" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.org !== "string" ||
      typeof decoded.tv !== "number" ||
      !isRole(decoded.role)
    ) {
      return { ok: false, reason: "invalid" };
    }
    return {
      ok: true,
      claims: {
        sub: decoded.sub,
        org: decoded.org,
        role: decoded.role,
        tv: decoded.tv,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof jwt.TokenExpiredError ? "expired" : "invalid",
    };
  }
};
