import mongoose, { type ClientSession } from "mongoose";
import { supportsTransactions } from "../../config/database";
import { logger } from "../logger";

/**
 * Unit of work passed to transactional service code.
 *
 *  - `session` must be passed to every read/write inside the transaction.
 *  - `afterCommit` schedules side effects (WhatsApp, email, cache busting)
 *    that must only happen once the data is durably committed.
 *  - `onRollback` registers compensating actions for work that cannot be
 *    part of the DB transaction (e.g. deleting an uploaded file).
 */
export interface TxContext {
  session: ClientSession | undefined;
  afterCommit(fn: () => Promise<unknown> | unknown): void;
  onRollback(fn: () => Promise<unknown> | unknown): void;
}

const runHooks = async (
  hooks: Array<() => Promise<unknown> | unknown>,
  phase: string,
) => {
  for (const hook of hooks) {
    try {
      await hook();
    } catch (err) {
      logger.error({ err, phase }, "Transaction hook failed");
    }
  }
};

/**
 * Runs `work` inside a MongoDB ACID transaction.
 *
 * Uses the driver's `session.withTransaction`, which automatically retries
 * on TransientTransactionError and UnknownTransactionCommitResult. Any thrown
 * error aborts the transaction, rolling back every write made with `session`,
 * then runs the registered compensating actions.
 */
export const withTransaction = async <T>(
  work: (tx: TxContext) => Promise<T>,
): Promise<T> => {
  let commitHooks: Array<() => Promise<unknown> | unknown> = [];
  const rollbackHooks: Array<() => Promise<unknown> | unknown> = [];

  const makeCtx = (session: ClientSession | undefined): TxContext => ({
    session,
    afterCommit: (fn) => commitHooks.push(fn),
    onRollback: (fn) => rollbackHooks.push(fn),
  });

  if (!supportsTransactions()) {
    // Dev-only standalone mode (production refuses to boot without a replica set).
    try {
      const out = await work(makeCtx(undefined));
      await runHooks(commitHooks, "afterCommit");
      return out;
    } catch (err) {
      await runHooks(rollbackHooks, "rollback");
      throw err;
    }
  }

  const session = await mongoose.startSession();
  try {
    let out: T | undefined;
    await session.withTransaction(
      async () => {
        commitHooks = []; // a retried attempt must not duplicate side effects
        out = await work(makeCtx(session));
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      },
    );
    await runHooks(commitHooks, "afterCommit");
    return out as T;
  } catch (err) {
    await runHooks(rollbackHooks, "rollback");
    throw err;
  } finally {
    await session.endSession();
  }
};
