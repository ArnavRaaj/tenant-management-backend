import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * One in-memory MongoDB *replica set* for the whole run, so multi-document
 * transactions (and their rollback) are exercised for real.
 */
let replSet: MongoMemoryReplSet | undefined;

export async function setup() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.TEST_MONGO_URI = replSet.getUri();
}

export async function teardown() {
  await replSet?.stop();
}
