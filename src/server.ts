import type { Server } from "http";
import { app } from "./app";
import { config } from "./config/env";
import {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
} from "./config/database";
import { closeRedis } from "./config/redis";
import { logger } from "./core/logger";
import { startJobQueue, stopJobQueue } from "./core/queue/jobQueue";
import {
  startAuditWriter,
  stopAuditWriter,
} from "./modules/audit/audit.writer";
import {
  closeEmailTransport,
  verifyEmailTransport,
} from "./modules/notifications/email.service";
import { pendingMigrations } from "./scripts/migrations/runner";

const SHUTDOWN_TIMEOUT_MS = 15_000;
let server: Server | null = null;
let shuttingDown = false;

const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down gracefully");

  const force = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  try {
    // 1. Stop accepting connections; let in-flight requests finish.
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    // 2. Drain background work and buffered audit logs.
    await stopJobQueue();
    await stopAuditWriter();
    closeEmailTransport();
    // 3. Close shared connections.
    await closeRedis();
    await disconnectDatabase();
    logger.info("Shutdown complete");
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    exitCode = 1;
  }
  process.exit(exitCode);
};

const bootstrap = async (): Promise<void> => {
  // The DB must be reachable before we accept traffic.
  await connectDatabase();

  const pending = await pendingMigrations();
  if (pending.length > 0) {
    const message = `Pending database migrations: ${pending.join(", ")}. Run "npm run migrate".`;
    if (config.isProduction) throw new Error(message);
    logger.error(message);
  } else if (!config.isProduction) {
    // Dev convenience: build declared indexes — only once data is migrated,
    // otherwise new unique indexes could reject legacy data.
    await ensureIndexes();
  }

  startJobQueue();
  startAuditWriter();
  void verifyEmailTransport();

  server = app.listen(config.port, () =>
    logger.info(
      { port: config.port, env: config.nodeEnv },
      "API server listening",
    ),
  );
  // Slightly above typical load-balancer idle timeouts to avoid 502s on reuse.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  void shutdown("uncaughtException", 1);
});

bootstrap().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
