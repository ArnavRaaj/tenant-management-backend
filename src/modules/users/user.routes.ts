import { Router, type Request } from "express";
import Joi from "joi";
import { pageQuerySchema, type PageQuery } from "../../core/db/pagination";
import { created, handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { RateLimits, rateLimit } from "../../core/middleware/rateLimit";
import { validate } from "../../core/middleware/validate";
import { PASSWORD_POLICY } from "../../core/security/password";
import { audit } from "../audit/audit.middleware";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import * as userService from "./user.service";

const email = Joi.string().trim().lowercase().email().max(254).required();
const idParams = Joi.object({ id: Joi.string().hex().length(24).required() });

const schemas = {
  invite: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(100).required(),
      email,
    }),
  },
  accept: {
    body: Joi.object({
      email,
      token: Joi.string().hex().length(64).required(),
      password: Joi.string().pattern(PASSWORD_POLICY).required().messages({
        "string.pattern.base":
          "Password must be 8-128 characters with an uppercase letter, a lowercase letter, a number and a special character",
      }),
      confirmPassword: Joi.string()
        .valid(Joi.ref("password"))
        .required()
        .messages({ "any.only": "Passwords do not match" }),
    }),
  },
  list: { query: Joi.object(pageQuerySchema) },
  status: {
    params: idParams,
    body: Joi.object({ isActive: Joi.boolean().required() }),
  },
};

const router = Router();

router.get(
  "/",
  authenticate,
  authorize("user:read"),
  validate(schemas.list),
  handle(async (req: Request) => {
    const { items, meta } = await userService.listAdmins(
      requireAuth(req),
      req.query as unknown as PageQuery,
    );
    return ok(items, meta);
  }),
);

router.post(
  "/invite",
  authenticate,
  authorize("user:write"),
  validate(schemas.invite),
  audit("ADMIN_INVITE", "user"),
  handle(async (req) =>
    created(await userService.inviteAdmin(requireAuth(req), req.body)),
  ),
);

router.patch(
  "/:id/status",
  authenticate,
  authorize("user:write"),
  validate(schemas.status),
  audit("ADMIN_STATUS_CHANGE", "user"),
  handle(async (req) =>
    ok(
      await userService.setAdminStatus(
        requireAuth(req),
        String(req.params.id),
        req.body.isActive,
      ),
    ),
  ),
);

// Public: invited admin sets their password.
router.post(
  "/accept-invitation",
  rateLimit(RateLimits.invite),
  validate(schemas.accept),
  audit("ADMIN_INVITE_ACCEPT", "user"),
  handle(async (req) => ok(await userService.acceptInvitation(req.body))),
);

export default router;
