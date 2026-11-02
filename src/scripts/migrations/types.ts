import type { mongo } from "mongoose";
import type { Logger } from "../../core/logger";

export interface MigrationContext {
  db: mongo.Db;
  dryRun: boolean;
  log: Logger;
}

export interface Migration {
  /** Stable, ordered identifier — never rename after it has run anywhere. */
  name: string;
  description: string;
  up(ctx: MigrationContext): Promise<void>;
}
