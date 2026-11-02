import Joi from "joi";
import type { Types } from "mongoose";
import type { CursorMeta, PaginationMeta } from "../http/apiResponse";

export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 100;

export interface PageQuery {
  page: number;
  limit: number;
}

/** Joi fragment for offset pagination; spread into a query schema. */
export const pageQuerySchema = {
  page: Joi.number().integer().min(1).max(10_000).default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
};

/** Joi fragment for keyset (cursor) pagination on append-only collections. */
export const cursorQuerySchema = {
  cursor: Joi.string().hex().length(24).optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
};

export const toSkip = ({ page, limit }: PageQuery): number =>
  (page - 1) * limit;

export const pageMeta = (q: PageQuery, total: number): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / q.limit));
  return {
    page: q.page,
    limit: q.limit,
    total,
    totalPages,
    hasNextPage: q.page < totalPages,
  };
};

export const cursorMeta = <T extends { _id: Types.ObjectId }>(
  items: T[],
  limit: number,
): CursorMeta => ({
  limit,
  nextCursor:
    items.length === limit ? String(items[items.length - 1]?._id) : null,
});
