import crypto from "crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import Joi from "joi";
import { config } from "../../config/env";
import { toObjectId } from "../../core/db/objectId";
import { cursorMeta, cursorQuerySchema } from "../../core/db/pagination";
import { NotFoundError, UnauthorizedError } from "../../core/errors/AppError";
import { handle, ok } from "../../core/http/apiResponse";
import { logger } from "../../core/logger";
import { authorize } from "../../core/middleware/authorize";
import { RateLimits, rateLimit } from "../../core/middleware/rateLimit";
import { validate } from "../../core/middleware/validate";
import { enqueueJob } from "../../core/queue/jobQueue";
import { safeEqual } from "../../core/security/crypto";
import { getString, isRecord } from "../../core/utils/http";
import { normalizePhone } from "../../core/utils/text";
import { authenticate, requireAuth } from "../auth/auth.middleware";
import {
  handleInboundMessage,
  updateDeliveryStatus,
  type InboundMessage,
} from "./inbound.service";
import { getWhatsAppProvider } from "./whatsapp.providers";
import {
  WhatsAppMessage,
  type WhatsAppMessageDoc,
} from "./whatsappMessage.model";

const router = Router();

// ── Meta webhook ─────────────────────────────────────────────────────────

/** GET /webhook — Meta subscription handshake (constant-time token compare). */
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    typeof token === "string" &&
    typeof challenge === "string" &&
    safeEqual(token, config.whatsapp.webhookVerifyToken)
  ) {
    return res.status(200).type("text/plain").send(challenge);
  }
  logger.warn("WhatsApp webhook verification failed");
  return res.status(403).json({
    success: false,
    error: { code: "FORBIDDEN", message: "Verification token mismatch" },
    requestId: req.requestId,
  });
});

/**
 * Verifies X-Hub-Signature-256 = HMAC-SHA256(appSecret, rawBody).
 * Without this anyone could POST forged tenant messages to the webhook.
 */
const verifyMetaSignature = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!config.whatsapp.appSecret) {
    if (config.isProduction)
      return next(
        new UnauthorizedError("Webhook signature secret not configured"),
      );
    return next(); // dev/test without a Meta app
  }
  const header = req.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${crypto
    .createHmac("sha256", config.whatsapp.appSecret)
    .update(req.rawBody ?? Buffer.alloc(0))
    .digest("hex")}`;
  if (!header || !safeEqual(header, expected)) {
    return next(new UnauthorizedError("Invalid webhook signature"));
  }
  next();
};

const extractText = (message: Record<string, unknown>): string => {
  switch (message.type) {
    case "text":
      return getString(message.text, "body") ?? "";
    case "button":
      return getString(message.button, "text") ?? "";
    case "interactive": {
      const i = message.interactive;
      return (
        (isRecord(i) &&
          (getString(i.button_reply, "title") ??
            getString(i.list_reply, "title"))) ||
        ""
      );
    }
    default:
      return "";
  }
};

/** POST /webhook — acknowledges immediately; processing happens in a background job. */
router.post(
  "/webhook",
  verifyMetaSignature,
  async (req: Request, res: Response) => {
    res.status(200).json({ status: "EVENT_RECEIVED" });

    const body: unknown = req.body;
    if (
      !isRecord(body) ||
      body.object !== "whatsapp_business_account" ||
      !Array.isArray(body.entry)
    ) {
      return;
    }
    try {
      for (const entry of body.entry) {
        const changes =
          isRecord(entry) && Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = isRecord(change) ? change.value : undefined;
          if (!isRecord(value)) continue;

          for (const message of Array.isArray(value.messages)
            ? value.messages
            : []) {
            if (!isRecord(message)) continue;
            const from = getString(message, "from");
            const id = getString(message, "id");
            const text = extractText(message);
            if (from && id && text) {
              await enqueueJob(
                "whatsapp.inbound",
                { from, body: text, messageId: id },
                { jobId: id },
              );
            }
          }
          for (const status of Array.isArray(value.statuses)
            ? value.statuses
            : []) {
            const id = getString(status, "id");
            const s = getString(status, "status");
            if (id && s) await updateDeliveryStatus(id, s.toUpperCase());
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to process WhatsApp webhook");
    }
  },
);

// ── Dev simulator (never mounted in production) ──────────────────────────
const simulateSchema = {
  body: Joi.object({
    phone: Joi.string()
      .trim()
      .pattern(/^\+?[\d\s-]{10,16}$/)
      .required(),
    message: Joi.string().trim().min(1).max(2000).required(),
  }),
};

router.post(
  "/dev/simulate-inbound",
  (_req: Request, _res: Response, next: NextFunction) =>
    config.whatsapp.simulatorEnabled
      ? next()
      : next(new NotFoundError("Route not found")),
  rateLimit(RateLimits.simulator),
  validate(simulateSchema),
  handle(async (req) => {
    const msg: InboundMessage = {
      from: req.body.phone,
      body: req.body.message,
      messageId: `dev_sim_${crypto.randomUUID()}`,
    };
    // Response deliberately excludes the tenant record (no PII leakage).
    return ok(await handleInboundMessage(msg));
  }),
);

// ── Admin diagnostics (org-scoped) ───────────────────────────────────────
const logsSchema = {
  query: Joi.object({
    ...cursorQuerySchema,
    direction: Joi.string().valid("INBOUND", "OUTBOUND").optional(),
    phone: Joi.string()
      .trim()
      .pattern(/^\+?[\d\s-]{10,16}$/)
      .optional(),
  }),
};

router.get(
  "/logs",
  authenticate,
  authorize("whatsapp:read"),
  validate(logsSchema),
  handle(async (req: Request) => {
    const auth = requireAuth(req);
    const q = req.query as unknown as {
      cursor?: string;
      limit: number;
      direction?: string;
      phone?: string;
    };
    // Organisation scope is ALWAYS applied; filters can only narrow it.
    const filter: Record<string, unknown> = {
      organizationId: toObjectId(auth.organizationId),
    };
    if (q.cursor) filter._id = { $lt: toObjectId(q.cursor) };
    if (q.direction) filter.direction = q.direction;
    if (q.phone) {
      const phone = normalizePhone(q.phone);
      filter.$or = [{ recipientPhone: phone }, { senderPhone: phone }];
    }
    const logs = await WhatsAppMessage.find(filter)
      .sort({ _id: -1 })
      .limit(q.limit)
      .lean<WhatsAppMessageDoc[]>();
    return ok(logs, cursorMeta(logs, q.limit));
  }),
);

router.get(
  "/status",
  authenticate,
  authorize("whatsapp:read"),
  handle(async () =>
    ok({
      activeProvider: getWhatsAppProvider().name,
      hasMetaCredentials: Boolean(
        config.whatsapp.phoneNumberId && config.whatsapp.accessToken,
      ),
      metaApiVersion: config.whatsapp.apiVersion,
      webhookSignatureVerification: Boolean(config.whatsapp.appSecret),
      webhookUrl: "/api/whatsapp/webhook",
      // The verify token itself is a secret and is never returned.
    }),
  ),
);

export default router;
