import mongoose from "mongoose";
import { logger } from "../../core/logger";
import { migrations } from "./index";

const COLLECTION = "schema_migrations";
const LOCK_ID = "__lock__";
const LOCK_TTL_MS = 30 * 60 * 1000;

interface MigrationRecord {
  _id: string;
  appliedAt?: Date;
  lockedUntil?: Date;
}

const collection = () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  return db.collection<MigrationRecord>(COLLECTION);
};

export const pendingMigrations = async (): Promise<string[]> => {
  const applied = await collection()
    .find({ _id: { $ne: LOCK_ID } }, { projection: { _id: 1 } })
    .toArray();
  const done = new Set(applied.map((m) => m._id));
  return migrations.filter((m) => !done.has(m.name)).map((m) => m.name);
};

/** Distributed lock so two deploying instances never migrate concurrently. */
const acquireLock = async (): Promise<boolean> => {
  const now = new Date();
  try {
    const res = await collection().findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [
          { lockedUntil: { $lt: now } },
          { lockedUntil: { $exists: false } },
        ],
      },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_TTL_MS) } },
      { upsert: true, returnDocument: "after" },
    );
    return Boolean(res);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false; // held by someone else
    throw err;
  }
};

const releaseLock = () =>
  collection().updateOne({ _id: LOCK_ID }, { $unset: { lockedUntil: "" } });

export const runMigrations = async (options: {
  dryRun: boolean;
}): Promise<string[]> => {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  if (!options.dryRun && !(await acquireLock())) {
    throw new Error("Another migration run holds the lock; try again later");
  }
  const ran: string[] = [];
  try {
    const pending = new Set(await pendingMigrations());
    for (const migration of migrations) {
      if (!pending.has(migration.name)) continue;
      const log = logger.child({ migration: migration.name });
      log.info({ dryRun: options.dryRun }, migration.description);
      await migration.up({ db, dryRun: options.dryRun, log });
      if (!options.dryRun) {
        await collection().insertOne({
          _id: migration.name,
          appliedAt: new Date(),
        });
      }
      ran.push(migration.name);
    }
  } finally {
    if (!options.dryRun) await releaseLock();
  }
  return ran;
};
