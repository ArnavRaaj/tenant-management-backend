import crypto from "crypto";
import mongoose from "mongoose";
import { afterAll, beforeAll } from "vitest";
import {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
} from "../../src/config/database";
import "../../src/scripts/migrations/index"; // registers every model

/** Connects this test file to its own database on the shared replica set. */
export const useTestDatabase = (options: { indexes?: boolean } = {}) => {
  beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI;
    if (!uri) throw new Error("TEST_MONGO_URI not set (globalSetup failed?)");
    await connectDatabase(uri, `test_${crypto.randomBytes(6).toString("hex")}`);
    // Unique indexes back the idempotency/duplicate tests. The migration
    // suite opts out to start from a legacy-shaped database.
    if (options.indexes !== false) await ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await disconnectDatabase();
  });
};

export const resetDatabase = async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
};
