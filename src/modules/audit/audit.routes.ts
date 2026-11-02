import { Router, type Request } from "express";
import Joi from "joi";
import { cursorMeta, cursorQuerySchema } from "../../core/db/pagination";
import { toObjectId } from "../../core/db/objectId";
import { handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import { audit } from "./audit.middleware";
import { AuditLog, type AuditLogDoc } from "./auditLog.model";

const listSchema = {
  query: Joi.object({
    ...cursorQuerySchema,
    action: Joi.string().max(64).optional(),
    resource: Joi.string().max(64).optional(),
    userId: Joi.string().hex().length(24).optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
  }),
};

interface ListQuery {
  cursor?: string;
  limit: number;
  action?: string;
  resource?: string;
  userId?: string;
  from?: Date;
  to?: Date;
}

const listAuditLogs = async (req: Request) => {
  const auth = requireAuth(req);
  const q = req.query as unknown as ListQuery;
  const filter: Record<string, unknown> = {
    organizationId: toObjectId(auth.organizationId),
  };
  if (q.cursor) filter._id = { $lt: toObjectId(q.cursor) };
  if (q.action) filter.action = q.action;
  if (q.resource) filter.resource = q.resource;
  if (q.userId) filter["actor.userId"] = toObjectId(q.userId);
  if (q.from || q.to) {
    filter.createdAt = {
      ...(q.from ? { $gte: q.from } : {}),
      ...(q.to ? { $lte: q.to } : {}),
    };
  }
  const logs = await AuditLog.find(filter)
    .sort({ _id: -1 })
    .limit(q.limit)
    .lean<AuditLogDoc[]>();
  return ok(logs, cursorMeta(logs, q.limit));
};

const router = Router();

// GET /api/audit-logs — organisation audit trail (cursor paginated)
router.get(
  "/",
  authenticate,
  authorize("audit:read"),
  validate(listSchema),
  audit("AUDIT_LOG_VIEW", "audit", { includeBody: false }),
  handle(listAuditLogs),
);

export default router;
