import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { getRequestContext } from "../../core/requestContext";
import { diffChanges, redact } from "./audit.redaction";
import { writeAuditLog } from "./audit.writer";

export interface AuditOptions {
  /** Store the (redacted) request body. Off for bulky/irrelevant payloads. */
  includeBody?: boolean;
}

const toObjectIdOrNull = (id: string | undefined): Types.ObjectId | null =>
  id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

/**
 * Route-level audit declaration:
 *   router.post("/", authenticate, audit("TENANT_CREATE", "tenant"), ...)
 *
 * WHO   → authenticated user (or anonymous for public routes), IP, user agent
 * WHAT  → action, resource, resourceId, field-level before/after diff
 * WHEN  → createdAt
 * Written after the response finishes (zero added latency), batched to DB.
 */
export const audit =
  (action: string, resource: string, options: AuditOptions = {}) =>
  (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const ctx = getRequestContext();
    // Express resets baseUrl/params once the router finishes, so capture the
    // route pattern and params now, while this route is executing.
    const path = `${req.baseUrl}${req.route?.path ?? ""}`;
    const params = { ...req.params };

    res.on("finish", () => {
      const change = ctx?.audit;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const resourceId =
        change?.resourceId ??
        (typeof params.id === "string" ? params.id : null);

      writeAuditLog({
        organizationId: toObjectIdOrNull(
          req.auth?.organizationId ?? ctx?.organizationId,
        ),
        actor: {
          userId: toObjectIdOrNull(req.auth?.userId ?? ctx?.userId),
          email: req.auth?.email ?? "",
          role: req.auth?.role ?? "anonymous",
        },
        ip: req.ip ?? "",
        userAgent: (req.get("user-agent") ?? "").slice(0, 512),
        action,
        resource,
        resourceId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        outcome: res.statusCode < 400 ? "SUCCESS" : "FAILURE",
        changes: diffChanges(change?.before ?? null, change?.after ?? null),
        request: {
          params: redact(params),
          query: redact(req.query),
          ...(options.includeBody !== false ? { body: redact(req.body) } : {}),
        },
        requestId: req.requestId,
        durationMs: Math.round(durationMs),
      });
    });
    next();
  };
