import { Router, type Request } from "express";
import Joi from "joi";
import { toObjectId } from "../../core/db/objectId";
import {
  pageMeta,
  pageQuerySchema,
  toSkip,
  type PageQuery,
} from "../../core/db/pagination";
import { created, handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { recordAuditChange } from "../../core/requestContext";
import { audit } from "../audit/audit.middleware";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import { Address, type AddressDoc } from "./address.model";

const schemas = {
  list: { query: Joi.object(pageQuerySchema) },
  create: {
    body: Joi.object({
      addressLine1: Joi.string().trim().min(1).max(200).required(),
      addressLine2: Joi.string().trim().max(200).allow("").default(""),
      city: Joi.string().trim().min(1).max(100).required(),
      postalCode: Joi.string()
        .pattern(/^\d{6}$/)
        .required()
        .messages({
          "string.pattern.base": "Postal code must be exactly 6 digits",
        }),
      state: Joi.string().trim().min(1).max(100).required(),
    }),
  },
};

const router = Router();

// Addresses are organisation-scoped: every admin of the org sees the same list.
router.get(
  "/",
  authenticate,
  authorize("address:read"),
  validate(schemas.list),
  handle(async (req: Request) => {
    const auth = requireAuth(req);
    const page = req.query as unknown as PageQuery;
    const filter = { organizationId: toObjectId(auth.organizationId) };
    const [items, total] = await Promise.all([
      Address.find(filter)
        .sort({ createdAt: -1 })
        .skip(toSkip(page))
        .limit(page.limit)
        .lean<AddressDoc[]>(),
      Address.countDocuments(filter),
    ]);
    return ok(items, pageMeta(page, total));
  }),
);

router.post(
  "/",
  authenticate,
  authorize("address:write"),
  validate(schemas.create),
  audit("ADDRESS_CREATE", "address"),
  handle(async (req: Request) => {
    const auth = requireAuth(req);
    const address = await Address.create({
      ...req.body,
      organizationId: toObjectId(auth.organizationId),
      createdBy: toObjectId(auth.userId),
    });
    recordAuditChange({
      resourceId: address._id.toHexString(),
      after: req.body,
    });
    return created(address.toObject());
  }),
);

export default router;
