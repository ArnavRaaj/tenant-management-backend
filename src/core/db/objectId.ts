import { Types } from "mongoose";

export const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  typeof id === "string" ? new Types.ObjectId(id) : id;

export const isObjectId = (id: unknown): id is string =>
  typeof id === "string" &&
  Types.ObjectId.isValid(id) &&
  /^[0-9a-f]{24}$/i.test(id);

export const idString = (
  value: Types.ObjectId | { _id: Types.ObjectId } | string | null | undefined,
): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  return value._id.toHexString();
};
