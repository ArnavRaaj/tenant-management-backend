import { Router, type Request } from "express";
import Joi from "joi";
import { pageQuerySchema, type PageQuery } from "../../core/db/pagination";
import { created, handle, noContent, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { audit } from "../audit/audit.middleware";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import { listFloorsHandler } from "../floors/floor.routes";
import * as flatService from "./flat.service";

const idParams = Joi.object({ id: Joi.string().hex().length(24).required() });

const schemas = {
  list: {
    query: Joi.object({
      ...pageQuerySchema,
      status: Joi.string().valid("vacant", "occupied").optional(),
      buildingName: Joi.string().trim().max(100).optional(),
      tag: Joi.string().trim().max(100).optional(), // alias of buildingName
    }),
  },
  create: {
    body: Joi.object({
      flatNumber: Joi.string().trim().min(1).max(20).required(),
      floor: Joi.number().integer().min(0).max(200).required(),
      buildingName: Joi.string().trim().min(1).max(100).required(),
      address: Joi.string().hex().length(24).optional(),
    }),
  },
  id: { params: idParams },
};

const idOf = (req: Request): string => String(req.params.id);

const router = Router();
router.use(authenticate);

router.get(
  "/",
  authorize("flat:read"),
  validate(schemas.list),
  handle(async (req) => {
    const q = req.query as unknown as PageQuery & {
      status?: "vacant" | "occupied";
      buildingName?: string;
      tag?: string;
    };
    const buildingName = q.buildingName ?? q.tag;
    const { items, meta } = await flatService.listFlats(requireAuth(req), {
      page: q.page,
      limit: q.limit,
      ...(q.status ? { status: q.status } : {}),
      ...(buildingName ? { buildingName } : {}),
    });
    return ok(items, meta);
  }),
);

router.post(
  "/",
  authorize("flat:write"),
  validate(schemas.create),
  audit("FLAT_CREATE", "flat"),
  handle(async (req) =>
    created(await flatService.createFlat(requireAuth(req), req.body)),
  ),
);

// Static paths are registered before "/:id".
router.get(
  "/meta/tags",
  authorize("flat:read"),
  handle(async (req) =>
    ok(await flatService.listBuildingNames(requireAuth(req))),
  ),
);
router.get("/meta/floors", authorize("floor:read"), listFloorsHandler);

router.get(
  "/:id",
  authorize("flat:read"),
  validate(schemas.id),
  audit("FLAT_VIEW", "flat", { includeBody: false }),
  handle(async (req) =>
    ok(await flatService.getFlat(requireAuth(req), idOf(req))),
  ),
);

router.delete(
  "/:id",
  authorize("flat:write"),
  validate(schemas.id),
  audit("FLAT_DELETE", "flat"),
  handle(async (req) => {
    await flatService.deleteFlat(requireAuth(req), idOf(req));
    return noContent();
  }),
);

router.get(
  "/:id/tenants",
  authorize("tenant:read"),
  validate(schemas.id),
  handle(async (req) =>
    ok(await flatService.flatTenantHistory(requireAuth(req), idOf(req))),
  ),
);
router.get(
  "/:id/revenue",
  authorize("rent:read"),
  validate(schemas.id),
  handle(async (req) =>
    ok(await flatService.flatRevenue(requireAuth(req), idOf(req))),
  ),
);
router.get(
  "/:id/vacant-history",
  authorize("flat:read"),
  validate(schemas.id),
  handle(async (req) =>
    ok(await flatService.flatVacancyHistory(requireAuth(req), idOf(req))),
  ),
);

export default router;
