import mongoose, { Schema, type ClientSession } from "mongoose";

/**
 * Monotonic per-organisation sequences (receipt and ticket numbers).
 * Replaces random 4-char suffixes, which collide at scale.
 * _id = "<orgId>:<sequenceName>:<YYYYMM>"
 */
interface CounterDoc {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<CounterDoc>(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { versionKey: false },
);

export const Counter = mongoose.model<CounterDoc>("Counter", CounterSchema);

export const nextSequence = async (
  key: string,
  session?: ClientSession,
): Promise<number> => {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session: session ?? null },
  ).lean();
  return doc?.seq ?? 1;
};

export const formatSequence = (prefix: string, period: number, seq: number) =>
  `${prefix}-${period}-${String(seq).padStart(6, "0")}`;
