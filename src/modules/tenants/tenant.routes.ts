import { Router, type Request } from "express";
import type { PageQuery } from "../../core/db/pagination";
import { BadRequestError } from "../../core/errors/AppError";
import { created, handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { singleFile } from "../../core/middleware/upload";
import { audit } from "../audit/audit.middleware";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import * as rentService from "./rent.service";
import * as tenantService from "./tenant.service";
import { IDEMPOTENCY_KEY, tenantSchemas } from "./tenant.validation";

const router = Router();
router.use(authenticate);

const aadhaarUpload = singleFile("aadharImage", ["jpeg", "png", "webp", "pdf"]);
const idOf = (req: Request): string => String(req.params.id);
const fileOf = (req: Request) =>
  req.file ? { buffer: req.file.buffer } : undefined;

const idempotencyKeyOf = (req: Request): string | null => {
  const key = req.get("idempotency-key");
  if (!key) return null;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new BadRequestError(
      "Idempotency-Key must be 8-100 URL-safe characters",
    );
  }
  return key;
};

router.get(
  "/",
  authorize("tenant:read"),
  validate(tenantSchemas.list),
  handle(async (req) => {
    const { items, meta } = await tenantService.listTenants(
      requireAuth(req),
      req.query as unknown as PageQuery & {
        status: "active" | "past";
        rentDue: boolean;
      },
    );
    return ok(items, meta);
  }),
);

router.post(
  "/",
  authorize("tenant:write"),
  aadhaarUpload,
  validate(tenantSchemas.create),
  audit("TENANT_ASSIGN", "tenant"),
  handle(async (req) => {
    const { flatId, ...input } = req.body;
    return created(
      await tenantService.assignTenant(
        requireAuth(req),
        flatId,
        input,
        fileOf(req),
      ),
    );
  }),
);

// Viewing a tenant exposes personal data → audited as a sensitive read.
router.get(
  "/:id",
  authorize("tenant:read"),
  validate(tenantSchemas.idOnly),
  audit("TENANT_VIEW", "tenant", { includeBody: false }),
  handle(async (req) =>
    ok(await tenantService.getTenant(requireAuth(req), idOf(req))),
  ),
);

router.put(
  "/:id",
  authorize("tenant:write"),
  aadhaarUpload,
  validate(tenantSchemas.update),
  audit("TENANT_UPDATE", "tenant"),
  handle(async (req) =>
    ok(
      await tenantService.updateTenant(
        requireAuth(req),
        idOf(req),
        req.body,
        fileOf(req),
      ),
    ),
  ),
);

router.get(
  "/:id/kyc-link",
  authorize("kyc:share"),
  validate(tenantSchemas.idOnly),
  audit("KYC_LINK_SHARE", "tenant", { includeBody: false }),
  handle(async (req) =>
    ok(await tenantService.getKycLink(requireAuth(req), idOf(req))),
  ),
);

router.post(
  "/:id/change",
  authorize("tenant:write"),
  aadhaarUpload,
  validate(tenantSchemas.change),
  audit("TENANT_CHANGE", "tenant"),
  handle(async (req) =>
    created(
      await tenantService.changeTenant(
        requireAuth(req),
        idOf(req),
        req.body,
        fileOf(req),
      ),
    ),
  ),
);

router.post(
  "/:id/vacate",
  authorize("tenant:write"),
  validate(tenantSchemas.idOnly),
  audit("TENANT_VACATE", "tenant"),
  handle(async (req) =>
    ok(await tenantService.vacateTenant(requireAuth(req), idOf(req))),
  ),
);

router.get(
  "/:id/rent",
  authorize("rent:read"),
  validate(tenantSchemas.rentHistory),
  handle(async (req) => {
    const { items, meta } = await rentService.listRentHistory(
      requireAuth(req),
      idOf(req),
      req.query as unknown as PageQuery,
    );
    return ok(items, meta);
  }),
);

router.post(
  "/:id/rent",
  authorize("rent:write"),
  validate(tenantSchemas.recordRent),
  audit("RENT_PAYMENT_RECORD", "tenant"),
  handle(async (req) => {
    const receipt = await rentService.recordRentPayment(
      requireAuth(req),
      idOf(req),
      req.body,
      idempotencyKeyOf(req),
    );
    // A replayed idempotent request returns the original receipt with 200.
    return receipt.replayed ? ok(receipt) : created(receipt);
  }),
);

export default router;
