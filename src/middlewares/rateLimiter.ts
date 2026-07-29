import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

interface TokenBucketOptions {
  capacity: number; // Maximum burst capacity (max tokens in bucket)
  refillRateSeconds: number; // How many seconds it takes to earn 1 token
  keyPrefix?: string; // Optional namespace for the bucket map
}

interface Bucket {
  tokens: number;
  lastRefill: number; // Timestamp in milliseconds
}

// In-memory store for Token Buckets across users/IPs
const buckets = new Map<string, Bucket>();

/**
 * Creates an Express middleware implementing the Token Bucket Rate Limiter algorithm.
 * Automatically throttles abuse while allowing controlled bursts of traffic.
 */

export const createTokenBucketLimiter = (options: TokenBucketOptions) => {
  const { capacity, refillRateSeconds, keyPrefix = "limiter" } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Identify consumer by email in body (if available) or fallback to IP address
    const identifier =
      req?.body?.email || req.ip || req.headers["x-forwarded-for"] || "unknown_ip";
    const key = `${keyPrefix}:${identifier}`;

    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      // Initialize fresh bucket with maximum capacity
      bucket = {
        tokens: capacity,
        lastRefill: now,
      };
    } else {
      // Calculate elapsed time in seconds since last refill calculation
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;

      // Calculate newly earned tokens based on the refill rate
      const earnedTokens = elapsedSeconds / refillRateSeconds;

      // Refill bucket without exceeding max capacity
      bucket.tokens = Math.min(capacity, bucket.tokens + earnedTokens);
      bucket.lastRefill = now;
    }

    // Set informational RateLimit headers
    res.setHeader("X-RateLimit-Limit", capacity.toString());
    res.setHeader("X-RateLimit-Remaining", Math.floor(bucket.tokens).toString());

    // Check if at least 1 token is available to process the request
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1; // Consume 1 token
      buckets.set(key, bucket);
      return next();
    } else {
      // No tokens left — rate limit tripped! Calculate wait time
      buckets.set(key, bucket);
      const missingTokens = 1 - bucket.tokens;
      const secondsToWait = Math.ceil(missingTokens * refillRateSeconds);
      res.setHeader("Retry-After", secondsToWait.toString());
      return next(
        new AppError(
          `Too many requests! Token Bucket depleted. Please try again in ${secondsToWait} second(s).`,
          429,
        ),
      );
    }
  };
};
