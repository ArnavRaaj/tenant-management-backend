import mongoose from "mongoose";
import { config } from "./env";
import { logger } from "../core/logger";

mongoose.set("strictQuery", true);
// Fail fast instead of silently queueing queries while disconnected.
mongoose.set("bufferCommands", false);
// Index/collection creation is explicit (see ensureIndexes / migrations);
// automatic creation at model-compile time would race the connection.
mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);

let transactionsSupported = false;

/** True when connected to a replica set / mongos (multi-document ACID). */
export const supportsTransactions = (): boolean => transactionsSupported;

export const connectDatabase = async (
  uri: string = config.mongo.uri,
  dbName: string = config.mongo.dbName,
): Promise<typeof mongoose> => {
  const conn = await mongoose.connect(uri, {
    dbName,
    maxPoolSize: config.mongo.maxPoolSize,
    minPoolSize: config.mongo.minPoolSize,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
  });

  const admin = conn.connection.db?.admin();
  const hello = admin ? await admin.command({ hello: 1 }) : {};
  transactionsSupported = Boolean(hello.setName || hello.msg === "isdbgrid");

  if (!transactionsSupported) {
    if (!config.mongo.allowStandalone) {
      throw new Error(
        "MongoDB must run as a replica set (transactions are required). " +
          "Use Atlas or start mongod with --replSet.",
      );
    }
    logger.warn(
      "Standalone MongoDB detected: transactions DISABLED (dev only). Multi-step writes are not atomic.",
    );
  }

  logger.info(
    {
      host: conn.connection.host,
      db: dbName,
      transactions: transactionsSupported,
    },
    "MongoDB connected",
  );
  return conn;
};

/** Builds every declared index (dev/test convenience; production uses migrations). */
export const ensureIndexes = async (): Promise<void> => {
  await Promise.all(
    mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()),
  );
};

export const isDatabaseReady = (): boolean =>
  mongoose.connection.readyState === mongoose.ConnectionStates.connected;

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};
