import { Router, type Request } from "express";
import Joi from "joi";
import { pageQuerySchema, type PageQuery } from "../../core/db/pagination";
import { created, handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { audit } from "../audit/audit.middleware";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import { TICKET_CATEGORIES, TICKET_URGENCIES } from "./aiClassifier";
import * as maintenanceService from "./maintenance.service";
import { TICKET_STATUSES } from "./ticket.model";

const objectId = Joi.string().hex().length(24);
const idParams = Joi.object({ id: objectId.required() });

const schemas = {
  list: {
    query: Joi.object({
      ...pageQuerySchema,
      status: Joi.string()
        .valid(...TICKET_STATUSES)
        .optional(),
      category: Joi.string()
        .valid(...TICKET_CATEGORIES)
        .optional(),
      urgency: Joi.string()
        .valid(...TICKET_URGENCIES)
        .optional(),
    }),
  },
  create: {
    body: Joi.object({
      tenantId: objectId.required(),
      description: Joi.string().trim().min(3).max(2000).required(),
      title: Joi.string().trim().max(150).optional(),
      category: Joi.string()
        .valid(...TICKET_CATEGORIES)
        .optional(),
      urgency: Joi.string()
        .valid(...TICKET_URGENCIES)
        .optional(),
      photos: Joi.array()
        .items(Joi.string().uri({ scheme: ["https"] }))
        .max(10)
        .optional(),
    }),
  },
  id: { params: idParams },
  status: {
    params: idParams,
    body: Joi.object({
      status: Joi.string()
        .valid(...TICKET_STATUSES)
        .optional(),
      assignedVendorNotes: Joi.string().trim().max(1000).allow("").optional(),
      resolutionNotes: Joi.string().trim().max(1000).allow("").optional(),
    }).min(1),
  },
};

const router = Router();
router.use(authenticate);

router.get(
  "/stats",
  authorize("maintenance:read"),
  handle(async (req) =>
    ok(await maintenanceService.getStats(requireAuth(req))),
  ),
);

router.get(
  "/tickets",
  authorize("maintenance:read"),
  validate(schemas.list),
  handle(async (req: Request) => {
    const { items, meta } = await maintenanceService.listTickets(
      requireAuth(req),
      req.query as unknown as PageQuery,
    );
    return ok(items, meta);
  }),
);

router.post(
  "/tickets",
  authorize("maintenance:write"),
  validate(schemas.create),
  audit("TICKET_CREATE", "maintenance"),
  handle(async (req) =>
    created(await maintenanceService.createTicket(requireAuth(req), req.body)),
  ),
);

router.get(
  "/tickets/:id",
  authorize("maintenance:read"),
  validate(schemas.id),
  handle(async (req) =>
    ok(
      await maintenanceService.getTicket(
        requireAuth(req),
        String(req.params.id),
      ),
    ),
  ),
);

router.patch(
  "/tickets/:id/status",
  authorize("maintenance:write"),
  validate(schemas.status),
  audit("TICKET_STATUS_UPDATE", "maintenance"),
  handle(async (req) =>
    ok(
      await maintenanceService.updateTicketStatus(
        requireAuth(req),
        String(req.params.id),
        req.body,
      ),
    ),
  ),
);

export default router;
