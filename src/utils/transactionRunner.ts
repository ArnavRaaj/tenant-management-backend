import mongoose, { ClientSession } from "mongoose";

/**
 * Executes a function within a MongoDB ACID transaction.
 * If the MongoDB instance is a standalone server without replica set support (e.g. basic local dev),
 * it gracefully falls back to executing the operations with clean error reporting.
 */
export const withTransaction = async <T>(
  work: (session?: ClientSession) => Promise<T>,
): Promise<T> => {
  let session: ClientSession;

  try {
    session = await mongoose.startSession();
  } catch {
    // If sessions cannot be created, execute directly
    return await work(undefined);
  }

  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    const isStandaloneError =
      error?.message?.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
      error?.codeName === "IllegalOperation";

    if (isStandaloneError) {
      console.warn(
        "⚠️  [withTransaction] Standalone MongoDB detected: transactions require a replica set. Executing fallback without transaction session.",
      );
      try {
        await session.abortTransaction();
      } catch {
        // silent
      }
      session.endSession();
      // Retry without session
      return await work(undefined);
    }

    try {
      await session.abortTransaction();
    } catch {
      // silent
    }
    throw error;
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch {
        // silent
      }
    }
  }
};
