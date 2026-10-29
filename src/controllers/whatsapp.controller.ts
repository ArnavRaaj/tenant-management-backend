import { Request, Response } from "express";
import {
  processInboundWhatsApp,
  getWhatsAppProvider,
} from "../service/whatsapp/whatsapp.service";
import {
  findWhatsAppMessagesRepo,
  countWhatsAppMessagesRepo,
  updateWhatsAppMessageStatusRepo,
} from "../repository/whatsapp.repository";

/**
 * Meta WhatsApp Webhook Verification (GET /api/whatsapp/webhook)
 */
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const expectedToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    "nivaasa_whatsapp_verify_token_2026";

  if (mode === "subscribe" && token === expectedToken) {
    console.log("✅ [META WHATSAPP] Webhook verified successfully!");
    return res.status(200).send(challenge);
  }

  console.warn(
    `❌ [META WHATSAPP] Webhook verification failed. Token mismatch: expected "${expectedToken}", received "${token}"`,
  );
  return res.status(403).json({ error: "Verification token mismatch" });
};

/**
 * Meta WhatsApp Inbound Event Webhook (POST /api/whatsapp/webhook)
 */
export const handleMetaWebhook = async (req: Request, res: Response) => {
  // Acknowledge receipt to Meta immediately (prevents duplicate retries)
  res.status(200).json({ status: "EVENT_RECEIVED" });

  const body = req.body;
  if (body?.object !== "whatsapp_business_account") {
    return;
  }

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // 1. Process Inbound Messages from Tenants
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            const from = message.from;
            let textBody = "";

            if (message.type === "text") {
              textBody = message.text?.body || "";
            } else if (message.type === "button") {
              textBody = message.button?.text || "";
            } else if (message.type === "interactive") {
              textBody =
                message.interactive?.button_reply?.title ||
                message.interactive?.list_reply?.title ||
                "";
            }

            if (from && textBody) {
              await processInboundWhatsApp({
                from,
                body: textBody,
                messageId: message.id,
                timestamp: message.timestamp,
                rawPayload: message,
              });
            }
          }
        }

        // 2. Process Status Updates (SENT -> DELIVERED -> READ)
        if (value.statuses && value.statuses.length > 0) {
          for (const statusObj of value.statuses) {
            const metaMessageId = statusObj.id;
            const newStatus = (statusObj.status || "").toUpperCase();
            if (metaMessageId && newStatus) {
              await updateWhatsAppMessageStatusRepo(metaMessageId, newStatus);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Error processing Meta WhatsApp webhook event:", err);
  }
};

/**
 * Developer Simulator: Simulate Inbound WhatsApp message (POST /api/whatsapp/dev/simulate-inbound)
 */
export const simulateInboundMessage = async (req: Request, res: Response) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({
      error: "Both 'phone' and 'message' fields are required in the request body",
    });
  }

  try {
    const result = await processInboundWhatsApp({
      from: phone,
      body: message,
      messageId: `dev_sim_${Date.now()}`,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("Simulation error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to simulate inbound message",
    });
  }
};

/**
 * Retrieve WhatsApp Communication Logs (GET /api/whatsapp/logs)
 */
export const getWhatsAppLogs = async (req: Request, res: Response) => {
  const organizationId = (req as any).organizationId;
  const { limit = "50", skip = "0", phone, direction } = req.query;

  const filter: any = {};
  if (organizationId) {
    filter.$or = [
      { organizationId },
      { organizationId: null }, // Include simulator logs during dev
    ];
  }
  if (direction) filter.direction = direction;
  if (phone) {
    filter.$or = [
      { recipientPhone: { $regex: String(phone) } },
      { senderPhone: { $regex: String(phone) } },
    ];
  }

  const [logs, total] = await Promise.all([
    findWhatsAppMessagesRepo(filter, Number(limit), Number(skip)),
    countWhatsAppMessagesRepo(filter),
  ]);

  return res.status(200).json({
    data: logs,
    total,
    limit: Number(limit),
    skip: Number(skip),
  });
};

/**
 * Check Current WhatsApp Provider & Configuration Status (GET /api/whatsapp/status)
 */
export const getWhatsAppConfigStatus = (_req: Request, res: Response) => {
  const provider = getWhatsAppProvider();
  const hasMetaCredentials = Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );

  return res.status(200).json({
    activeProvider: provider.name,
    hasMetaCredentials,
    phoneNumberIdConfigured: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    metaApiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    webhookVerifyTokenConfigured: Boolean(
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    ),
    webhookVerifyToken:
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      "nivaasa_whatsapp_verify_token_2026",
    webhookUrl: "/api/whatsapp/webhook",
  });
};

