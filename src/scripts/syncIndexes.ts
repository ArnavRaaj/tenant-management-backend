/** Re-syncs indexes with the schemas (drops undeclared ones). */
import { connectDatabase, disconnectDatabase } from "../config/database";
import { logger } from "../core/logger";
import { syncAllIndexes } from "./migrations/index";

const main = async () => {
  await connectDatabase();
  const { default: mongoose } = await import("mongoose");
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  await syncAllIndexes.up({
    db,
    dryRun: process.argv.includes("--dry-run"),
    log: logger,
  });
  await disconnectDatabase();
};

main().catch((err) => {
  logger.fatal({ err }, "Index sync failed");
  process.exit(1);
});
