import { config } from "../../config/env";
import { logger } from "../../core/logger";
import { AuditLog, type AuditLogDoc } from "./auditLog.model";

export type AuditEntry = Omit<AuditLogDoc, "_id" | "createdAt">;

/**
 * Batches audit entries and writes them with a single insertMany, so audit
 * logging adds no per-request DB round-trip and survives bursts of traffic.
 * Flushed every second, at 100 entries, and on graceful shutdown.
 */
const MAX_BATCH = 100;
const FLUSH_INTERVAL_MS = 1000;

let buffer: AuditEntry[] = [];
let timer: NodeJS.Timeout | null = null;
let flushing: Promise<void> = Promise.resolve();

export const flushAuditLogs = (): Promise<void> => {
  const batch = buffer;
  buffer = [];
  if (batch.length === 0) return flushing;
  flushing = flushing.then(async () => {
    try {
      await AuditLog.insertMany(batch, { ordered: false });
    } catch (err) {
      logger.error(
        { err, count: batch.length },
        "Failed to persist audit logs",
      );
    }
  });
  return flushing;
};

export const writeAuditLog = (entry: AuditEntry): void => {
  buffer.push(entry);
  if (buffer.length >= MAX_BATCH) void flushAuditLogs();
};

export const startAuditWriter = (): void => {
  if (timer || config.isTest) return;
  timer = setInterval(() => void flushAuditLogs(), FLUSH_INTERVAL_MS);
  timer.unref();
};

export const stopAuditWriter = async (): Promise<void> => {
  if (timer) clearInterval(timer);
  timer = null;
  await flushAuditLogs();
};
