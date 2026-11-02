import type { NextFunction, Request, Response } from "express";
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
  type RateLimiterAbstract,
} from "rate-limiter-flexible";
import { getRedis } from "../../config/redis";
import { TooManyRequestsError } from "../errors/AppError";
import { logger } from "../logger";

/**
 * Token-bucket style limiters backed by Redis (shared across instances) or
 * process memory (dev). `points` requests per `durationSeconds`; once
 * exhausted the key is blocked for `blockSeconds` (defaults to duration).
 */
export interface LimiterOptions {
  name: string;
  points: number;
  durationSeconds: number;
  blockSeconds?: number;
}

export interface Limiter {
  consume(key: string, points?: number): Promise<void>;
  /** Throws TooManyRequestsError if the key is currently blocked. */
  assertNotBlocked(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

const registry = new Map<string, RateLimiterAbstract>();

const getBackend = (opts: LimiterOptions): RateLimiterAbstract => {
  const existing = registry.get(opts.name);
  if (existing) return existing;
  const common = {
    keyPrefix: `rl:${opts.name}`,
    points: opts.points,
    duration: opts.durationSeconds,
    blockDuration: opts.blockSeconds ?? opts.durationSeconds,
  };
  const redis = getRedis();
  const limiter = redis
    ? new RateLimiterRedis({ ...common, storeClient: redis })
    : new RateLimiterMemory(common);
  registry.set(opts.name, limiter);
  return limiter;
};

const toTooMany = (res: RateLimiterRes): TooManyRequestsError =>
  new TooManyRequestsError(Math.max(1, Math.ceil(res.msBeforeNext / 1000)));

export const createLimiter = (opts: LimiterOptions): Limiter => ({
  async consume(key, points = 1) {
    try {
      await getBackend(opts).consume(key, points);
    } catch (err) {
      if (err instanceof RateLimiterRes) throw toTooMany(err);
      // Store outage: fail open rather than taking the API down.
      logger.error({ err, limiter: opts.name }, "Rate limiter store error");
    }
  },
  async assertNotBlocked(key) {
    try {
      const res = await getBackend(opts).get(key);
      if (res && res.consumedPoints >= opts.points && res.msBeforeNext > 0) {
        throw toTooMany(res);
      }
    } catch (err) {
      if (err instanceof TooManyRequestsError) throw err;
      logger.error({ err, limiter: opts.name }, "Rate limiter store error");
    }
  },
  async reset(key) {
    await getBackend(opts)
      .delete(key)
      .catch(() => undefined);
  },
});

export type KeyFn = (req: Request) => string | null;

export const byIp: KeyFn = (req) => req.ip ?? "unknown";
export const byUserOrIp: KeyFn = (req) =>
  req.auth ? `u:${req.auth.userId}` : `ip:${req.ip ?? "unknown"}`;

/** Express middleware form. Sets standard RateLimit-* headers. */
export const rateLimit = (opts: LimiterOptions, keyFn: KeyFn = byIp) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn(req);
    if (!key) return next();
    try {
      const out = await getBackend(opts).consume(key);
      res.setHeader("RateLimit-Limit", String(opts.points));
      res.setHeader("RateLimit-Remaining", String(out.remainingPoints));
      res.setHeader(
        "RateLimit-Reset",
        String(Math.ceil(out.msBeforeNext / 1000)),
      );
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.max(1, Math.ceil(err.msBeforeNext / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        res.setHeader("RateLimit-Limit", String(opts.points));
        res.setHeader("RateLimit-Remaining", "0");
        return next(new TooManyRequestsError(retryAfter));
      }
      logger.error({ err, limiter: opts.name }, "Rate limiter store error");
      next();
    }
  };
};

/** Central catalogue of limits so they are easy to review and tune. */
export const RateLimits = {
  global: { name: "global", points: 600, durationSeconds: 60 },
  login: { name: "login-ip", points: 30, durationSeconds: 15 * 60 },
  loginFailures: {
    name: "login-fail",
    points: 5,
    durationSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  },
  otpSend: { name: "otp-send", points: 5, durationSeconds: 15 * 60 },
  otpVerify: { name: "otp-verify-ip", points: 30, durationSeconds: 15 * 60 },
  refresh: { name: "refresh", points: 60, durationSeconds: 60 },
  invite: { name: "invite-accept", points: 10, durationSeconds: 15 * 60 },
  kycPublic: { name: "kyc-ip", points: 30, durationSeconds: 60 * 60 },
  kycOtpPerToken: {
    name: "kyc-otp-token",
    points: 5,
    durationSeconds: 60 * 60,
  },
  simulator: { name: "wa-sim", points: 60, durationSeconds: 60 },
} as const satisfies Record<string, LimiterOptions>;

/** Test helper: drop limiter state between suites. */
export const resetRateLimiters = (): void => registry.clear();
