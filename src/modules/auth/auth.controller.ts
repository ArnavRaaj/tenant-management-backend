import type { CookieOptions, Request, Response } from "express";
import { config } from "../../config/env";
import { ForbiddenError } from "../../core/errors/AppError";
import { created, noContent, ok } from "../../core/http/apiResponse";
import * as authService from "./auth.service";
import { requireAuth } from "./auth.middleware";

export const REFRESH_COOKIE = "nv_rt";

const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true, // not readable by JavaScript → immune to XSS token theft
  secure: config.auth.cookieSecure,
  sameSite: config.auth.cookieSameSite,
  path: "/api/auth", // only sent to auth endpoints
  ...(expires ? { expires } : {}),
});

const meta = (req: Request): authService.ClientMeta => ({
  ip: req.ip ?? "",
  userAgent: req.get("user-agent") ?? "",
});

const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
};

/**
 * Cookie-authenticated endpoints are CSRF targets when SameSite=None.
 * Require the browser's Origin header to be an allowed frontend origin.
 */
const assertTrustedOrigin = (req: Request) => {
  const origin = req.get("origin");
  if (origin && !config.corsOrigins.includes(origin.replace(/\/$/, ""))) {
    throw new ForbiddenError("Untrusted request origin");
  }
};

const sendSession = (res: Response, session: authService.Session) => {
  res.cookie(
    REFRESH_COOKIE,
    session.refreshToken,
    cookieOptions(session.refreshExpiresAt),
  );
  return {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  };
};

export const register = async (req: Request) =>
  created(await authService.register(req.body));

export const verifyEmail = async (req: Request, res: Response) =>
  ok(sendSession(res, await authService.verifyEmail(req.body, meta(req))));

export const resendVerification = async (req: Request) =>
  ok(await authService.resendVerification(req.body.email));

export const login = async (req: Request, res: Response) =>
  ok(sendSession(res, await authService.login(req.body, meta(req))));

export const refresh = async (req: Request, res: Response) => {
  assertTrustedOrigin(req);
  try {
    const session = await authService.refreshSession(
      readRefreshCookie(req),
      meta(req),
    );
    return ok(sendSession(res, session));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
};

export const logout = async (req: Request, res: Response) => {
  assertTrustedOrigin(req);
  await authService.logout(readRefreshCookie(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  return noContent();
};

export const logoutAll = async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  await authService.revokeAllSessions(auth.userId);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  return noContent();
};

export const me = async (req: Request) =>
  ok(await authService.getProfile(requireAuth(req).userId));

export const requestPasswordReset = async (req: Request) =>
  ok(await authService.requestPasswordReset(req.body.email));

export const verifyPasswordResetOtp = async (req: Request) =>
  ok(await authService.verifyPasswordResetOtp(req.body));

export const resetPassword = async (req: Request) =>
  ok(await authService.resetPassword(req.body));
