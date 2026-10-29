import {
  IWhatsAppProvider,
  WhatsAppSendOptions,
  WhatsAppSendResult,
} from "./whatsappProvider.interface";
import { createWhatsAppMessageRepo } from "../../repository/whatsapp.repository";

export class MetaCloudWhatsAppProvider implements IWhatsAppProvider {
  name: "META" = "META";

  private getCredentials() {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
    return { phoneNumberId, accessToken, apiVersion };
  }

  /**
   * Formats phone number into international E.164 without '+'
   * Defaults 10-digit Indian numbers to prefix '91'
   */
  private formatPhoneNumber(phone: string): string {
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
    return digits;
  }

  async sendTextMessage(
    to: string,
    text: string,
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult> {
    const formattedPhone = this.formatPhoneNumber(to);
    const { phoneNumberId, accessToken, apiVersion } = this.getCredentials();

    if (!phoneNumberId || !accessToken) {
      console.warn(
        "⚠️ [META WHATSAPP] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN. Falling back to simulator logging.",
      );
      // Fall back gracefully so development is never blocked
      return this.fallbackSend(formattedPhone, text, options);
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedPhone,
      type: "text",
      text: {
        preview_url: true,
        body: text,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json();

      if (!response.ok) {
        console.error("❌ [META WHATSAPP ERROR]", data);
        const errorMsg = data?.error?.message || "Failed to send Meta WhatsApp message";

        await createWhatsAppMessageRepo({
          direction: "OUTBOUND",
          senderPhone: phoneNumberId,
          recipientPhone: formattedPhone,
          body: text,
          messageType: "TEXT",
          status: "FAILED",
          provider: "META",
          error: errorMsg,
          tenant: options?.tenantId || null,
          organizationId: options?.organizationId || null,
          context: options?.context || { type: "GENERAL" },
          metadata: { metaError: data },
        });

        return {
          success: false,
          messageId: "",
          status: "FAILED",
          recipientPhone: formattedPhone,
          body: text,
          provider: "META",
          error: errorMsg,
          details: data,
        };
      }

      const metaMessageId = data.messages?.[0]?.id || `wamid.${Date.now()}`;

      await createWhatsAppMessageRepo({
        direction: "OUTBOUND",
        senderPhone: phoneNumberId,
        recipientPhone: formattedPhone,
        body: text,
        messageType: "TEXT",
        status: "SENT",
        provider: "META",
        metaMessageId,
        tenant: options?.tenantId || null,
        organizationId: options?.organizationId || null,
        context: options?.context || { type: "GENERAL" },
        metadata: data,
      });

      return {
        success: true,
        messageId: metaMessageId,
        status: "SENT",
        recipientPhone: formattedPhone,
        body: text,
        provider: "META",
        details: data,
      };
    } catch (err: any) {
      console.error("❌ [META WHATSAPP NETWORK ERROR]", err);
      return {
        success: false,
        messageId: "",
        status: "FAILED",
        recipientPhone: formattedPhone,
        body: text,
        provider: "META",
        error: err?.message,
      };
    }
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult> {
    const formattedPhone = this.formatPhoneNumber(to);
    const { phoneNumberId, accessToken, apiVersion } = this.getCredentials();

    if (!phoneNumberId || !accessToken) {
      console.warn(
        "⚠️ [META WHATSAPP] Missing credentials. Falling back to simulator logging for template.",
      );
      return this.fallbackSend(
        formattedPhone,
        `[Template: ${templateName}]`,
        options,
      );
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode || "en" },
        components,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json();

      if (!response.ok) {
        console.error("❌ [META WHATSAPP TEMPLATE ERROR]", data);
        const errorMsg = data?.error?.message || "Failed to send Meta template";

        await createWhatsAppMessageRepo({
          direction: "OUTBOUND",
          senderPhone: phoneNumberId,
          recipientPhone: formattedPhone,
          body: `[Template: ${templateName}]`,
          messageType: "TEMPLATE",
          templateName,
          status: "FAILED",
          provider: "META",
          error: errorMsg,
          tenant: options?.tenantId || null,
          organizationId: options?.organizationId || null,
          context: options?.context || { type: "GENERAL" },
          metadata: { metaError: data },
        });

        return {
          success: false,
          messageId: "",
          status: "FAILED",
          recipientPhone: formattedPhone,
          body: `[Template: ${templateName}]`,
          provider: "META",
          error: errorMsg,
          details: data,
        };
      }

      const metaMessageId = data.messages?.[0]?.id || `wamid.${Date.now()}`;

      await createWhatsAppMessageRepo({
        direction: "OUTBOUND",
        senderPhone: phoneNumberId,
        recipientPhone: formattedPhone,
        body: `[Template: ${templateName}]`,
        messageType: "TEMPLATE",
        templateName,
        status: "SENT",
        provider: "META",
        metaMessageId,
        tenant: options?.tenantId || null,
        organizationId: options?.organizationId || null,
        context: options?.context || { type: "GENERAL" },
        metadata: data,
      });

      return {
        success: true,
        messageId: metaMessageId,
        status: "SENT",
        recipientPhone: formattedPhone,
        body: `[Template: ${templateName}]`,
        provider: "META",
        details: data,
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: "",
        status: "FAILED",
        recipientPhone: formattedPhone,
        body: `[Template: ${templateName}]`,
        provider: "META",
        error: err?.message,
      };
    }
  }

  private async fallbackSend(
    to: string,
    text: string,
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult> {
    const messageId = `sim_fallback_${Date.now()}`;
    console.log(`[META FALLBACK TO SIMULATOR] To: ${to} | Text: ${text}`);

    await createWhatsAppMessageRepo({
      direction: "OUTBOUND",
      senderPhone: "NIVAASA_FALLBACK",
      recipientPhone: to,
      body: text,
      messageType: "TEXT",
      status: "DELIVERED",
      provider: "SIMULATOR",
      metaMessageId: messageId,
      tenant: options?.tenantId || null,
      organizationId: options?.organizationId || null,
      context: options?.context || { type: "GENERAL" },
      metadata: { fallbackReason: "Meta credentials not provided or invalid" },
    });

    return {
      success: true,
      messageId,
      status: "DELIVERED",
      recipientPhone: to,
      body: text,
      provider: "SIMULATOR",
    };
  }
}

