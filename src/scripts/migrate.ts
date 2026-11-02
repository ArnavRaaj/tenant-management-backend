/**
 * Applies pending database migrations.
 *
 *   npm run migrate:dev -- --dry-run   # report what would change
 *   npm run migrate:dev                # apply (take a backup first: mongodump)
 *   npm run migrate                    # production (compiled dist/)
 */
import { connectDatabase, disconnectDatabase } from "../config/database";
import { logger } from "../core/logger";
import { pendingMigrations, runMigrations } from "./migrations/runner";

const main = async () => {
  const dryRun = process.argv.includes("--dry-run");
  await connectDatabase();
  const pending = await pendingMigrations();
  if (pending.length === 0) {
    logger.info("Database is up to date");
  } else {
    logger.info({ pending, dryRun }, "Running migrations");
    const ran = await runMigrations({ dryRun });
    logger.info(
      { ran, dryRun },
      dryRun ? "Dry run complete (no changes written)" : "Migrations applied",
    );
  }
  await disconnectDatabase();
};

main().catch(async (err) => {
  logger.fatal({ err }, "Migration failed");
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
