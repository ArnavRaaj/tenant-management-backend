import crypto from "crypto";
import { config } from "../../config/env";
import { UpstreamError } from "../../core/errors/AppError";
import { logger } from "../../core/logger";
import { fetchJson, isRecord } from "../../core/utils/http";

export interface SendResult {
  messageId: string;
  provider: "SIMULATOR" | "META";
  status: "SENT" | "DELIVERED";
  recipient: string;
}

export interface WhatsAppProvider {
  readonly name: "SIMULATOR" | "META";
  sendText(to: string, text: string): Promise<SendResult>;
}

/** Formats a number as E.164 without '+', defaulting 10-digit numbers to India. */
export const toE164 = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return `91${digits.slice(1)}`;
  return digits;
};

/** Free local provider: prints messages instead of sending them. */
export class SimulatorProvider implements WhatsAppProvider {
  readonly name = "SIMULATOR" as const;

  async sendText(to: string, text: string): Promise<SendResult> {
    logger.info(
      { to: `+91 ${to.slice(-4).padStart(10, "X")}` },
      `[WHATSAPP SIMULATOR]\n${text}`,
    );
    return {
      messageId: `sim_${crypto.randomUUID()}`,
      provider: this.name,
      status: "DELIVERED",
      recipient: to,
    };
  }
}

/** Meta WhatsApp Cloud API. Throws on failure so the job queue retries. */
export class MetaCloudProvider implements WhatsAppProvider {
  readonly name = "META" as const;

  async sendText(to: string, text: string): Promise<SendResult> {
    const { phoneNumberId, accessToken, apiVersion } = config.whatsapp;
    if (!phoneNumberId || !accessToken) {
      throw new UpstreamError(
        "WhatsApp Cloud API credentials are not configured",
      );
    }
    const recipient = toE164(to);
    const res = await fetchJson(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: true, body: text },
        }),
      },
    );
    if (!res.ok) {
      const message =
        isRecord(res.body) &&
        isRecord(res.body.error) &&
        typeof res.body.error.message === "string"
          ? res.body.error.message
          : `Meta API responded ${res.status}`;
      throw new UpstreamError(`WhatsApp send failed: ${message}`);
    }
    const messages = isRecord(res.body) ? res.body.messages : undefined;
    const first = Array.isArray(messages) ? messages[0] : undefined;
    const messageId =
      isRecord(first) && typeof first.id === "string"
        ? first.id
        : `wamid.unknown.${Date.now()}`;
    return { messageId, provider: this.name, status: "SENT", recipient };
  }
}

let provider: WhatsAppProvider | null = null;

export const getWhatsAppProvider = (): WhatsAppProvider => {
  if (!provider) {
    provider =
      config.whatsapp.provider === "meta"
        ? new MetaCloudProvider()
        : new SimulatorProvider();
  }
  return provider;
};

/** Test hook */
export const setWhatsAppProvider = (p: WhatsAppProvider | null): void => {
  provider = p;
};
