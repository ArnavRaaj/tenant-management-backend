import { getRedis } from "../../config/redis";
import { logger } from "../logger";

/**
 * Small read-through cache. Redis when configured (shared across instances),
 * otherwise a bounded in-process TTL map. Cache failures never fail requests.
 */
interface Entry {
  value: string;
  expiresAt: number;
}

const MAX_MEMORY_ENTRIES = 5000;
const memory = new Map<string, Entry>();

const memoryGet = (key: string): string | null => {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
};

const memorySet = (key: string, value: string, ttlSeconds: number) => {
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const redis = getRedis();
    const raw = redis ? await redis.get(key) : memoryGet(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    logger.warn({ err, key }, "cache get failed");
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> => {
  try {
    const raw = JSON.stringify(value);
    const redis = getRedis();
    if (redis) await redis.set(key, raw, "EX", ttlSeconds);
    else memorySet(key, raw, ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "cache set failed");
  }
};

export const cacheDel = async (...keys: string[]): Promise<void> => {
  if (keys.length === 0) return;
  try {
    const redis = getRedis();
    if (redis) await redis.del(...keys);
    else keys.forEach((k) => memory.delete(k));
  } catch (err) {
    logger.warn({ err, keys }, "cache delete failed");
  }
};

export const cached = async <T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> => {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  await cacheSet(key, value, ttlSeconds);
  return value;
};

/** Test helper */
export const clearMemoryCache = () => memory.clear();

export const CacheKeys = {
  authUser: (userId: string) => `auth:user:${userId}`,
  floors: (orgId: string) => `floors:${orgId}`,
  dashboard: (orgId: string, period: number) => `dashboard:${orgId}:${period}`,
  dashboardPattern: (orgId: string) => `dashboard:${orgId}:*`,
};

/** Invalidates all dashboard entries for an org (period-keyed). */
export const invalidateDashboard = async (orgId: string): Promise<void> => {
  try {
    const redis = getRedis();
    if (redis) {
      const stream = redis.scanStream({
        match: CacheKeys.dashboardPattern(orgId),
        count: 100,
      });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length) await redis.del(...keys);
      }
    } else {
      const prefix = `dashboard:${orgId}:`;
      for (const key of memory.keys()) {
        if (key.startsWith(prefix)) memory.delete(key);
      }
    }
  } catch (err) {
    logger.warn({ err }, "dashboard cache invalidation failed");
  }
};
