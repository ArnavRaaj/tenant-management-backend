import { Redis } from "ioredis";
import { config } from "./env";
import { logger } from "../core/logger";

/**
 * Shared Redis connection (rate limiting, cache, job queues).
 * Optional: when REDIS_URL is unset the app falls back to in-process
 * implementations, which is fine for a single dev instance but NOT for
 * horizontally scaled deployments.
 */
let client: Redis | null = null;

export const getRedis = (): Redis | null => {
  if (!config.redisUrl) return null;
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null, // required by BullMQ workers
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", (err: Error) =>
      logger.error({ err: err.message }, "Redis connection error"),
    );
    client.on("ready", () => logger.info("Redis connected"));
  }
  return client;
};

export const pingRedis = async (): Promise<boolean> => {
  const redis = getRedis();
  if (!redis) return true; // not configured → not a readiness dependency
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
};

export const closeRedis = async (): Promise<void> => {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
};
