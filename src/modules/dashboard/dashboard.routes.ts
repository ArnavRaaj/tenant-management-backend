import { Router, type Request } from "express";
import Joi from "joi";
import { CacheKeys, cached } from "../../core/cache/cache";
import { toObjectId } from "../../core/db/objectId";
import { handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { toRupees } from "../../core/utils/money";
import {
  MONTH_NAMES,
  currentPeriod,
  monthNumberFromName,
  periodLabel,
  periodYear,
  toPeriod,
} from "../../core/utils/period";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import { getFloorNameMap } from "../floors/floor.service";
import { RentHistory } from "../tenants/rent.model";

const DASHBOARD_TTL_SECONDS = 60;
const MONTHS_OF_HISTORY = 24;

const schema = {
  query: Joi.object({
    month: Joi.string()
      .valid(...MONTH_NAMES)
      .insensitive()
      .optional(),
    year: Joi.number().integer().min(2000).max(2100).optional(),
  }),
};

/**
 * Revenue analytics. Uses the denormalised `floor`/`period` on rent records
 * (no $lookup), reads from secondaries when available, and is cached per
 * organisation for 60s (invalidated whenever a payment is recorded).
 */
const computeStats = async (organizationId: string, period: number) => {
  const org = toObjectId(organizationId);
  const fromPeriod = toPeriod(periodYear(period) - 2, 1);

  const [monthly, floors, floorNames] = await Promise.all([
    RentHistory.aggregate<{ _id: number; total: number }>([
      { $match: { organizationId: org, period: { $gte: fromPeriod } } },
      { $group: { _id: "$period", total: { $sum: "$amountPaid" } } },
      { $sort: { _id: 1 } },
      { $limit: MONTHS_OF_HISTORY + 12 },
    ]).read("secondaryPreferred"),
    RentHistory.aggregate<{ _id: number; total: number }>([
      { $match: { organizationId: org, period } },
      { $group: { _id: "$floor", total: { $sum: "$amountPaid" } } },
      { $sort: { _id: 1 } },
    ]).read("secondaryPreferred"),
    getFloorNameMap(organizationId),
  ]);

  return {
    period: periodLabel(period),
    monthlyRentBreakdown: monthly.map((m) => ({
      monthStr: periodLabel(m._id),
      period: m._id,
      totalRent: toRupees(m.total),
    })),
    floorRentBreakdown: floors.map((f) => ({
      floorStr:
        floorNames.get(f._id) ??
        (f._id === 0 ? "Ground Floor" : `Floor ${f._id}`),
      floorNum: f._id,
      totalRent: toRupees(f.total),
    })),
  };
};

const router = Router();

router.get(
  "/stats",
  authenticate,
  authorize("dashboard:read"),
  validate(schema),
  handle(async (req: Request) => {
    const auth = requireAuth(req);
    const q = req.query as { month?: string; year?: number };
    const now = currentPeriod();
    const month = q.month ? monthNumberFromName(q.month) : now % 100;
    const period = toPeriod(q.year ?? periodYear(now), month ?? now % 100);
    const stats = await cached(
      CacheKeys.dashboard(auth.organizationId, period),
      DASHBOARD_TTL_SECONDS,
      () => computeStats(auth.organizationId, period),
    );
    return ok(stats);
  }),
);

export default router;
