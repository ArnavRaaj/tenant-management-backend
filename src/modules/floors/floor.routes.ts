import { Router, type Request } from "express";
import Joi from "joi";
import { created, handle, ok } from "../../core/http/apiResponse";
import { authorize } from "../../core/middleware/authorize";
import { validate } from "../../core/middleware/validate";
import { audit } from "../audit/audit.middleware";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import * as floorService from "./floor.service";

const createSchema = {
  body: Joi.object({
    floorNumber: Joi.number().integer().min(0).max(200).required(),
    name: Joi.string().trim().min(1).max(50).required(),
    order: Joi.number().integer().min(0).max(1000).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

export const listFloorsHandler = handle(async (req: Request) =>
  ok(await floorService.listFloors(requireAuth(req).organizationId)),
);

const router = Router();

router.get("/", authenticate, authorize("floor:read"), listFloorsHandler);
router.post(
  "/",
  authenticate,
  authorize("floor:write"),
  validate(createSchema),
  audit("FLOOR_CREATE", "floor"),
  handle(async (req) =>
    created(
      await floorService.createFloor(requireAuth(req).organizationId, req.body),
    ),
  ),
);

export default router;
