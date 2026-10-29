import {
  IWhatsAppProvider,
  WhatsAppSendOptions,
  WhatsAppSendResult,
} from "./whatsappProvider.interface";
import { createWhatsAppMessageRepo } from "../../repository/whatsapp.repository";

export class SimulatorWhatsAppProvider implements IWhatsAppProvider {
  name: "SIMULATOR" = "SIMULATOR";

  async sendTextMessage(
    to: string,
    text: string,
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult> {
    const messageId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Beautiful console logging for local developer visibility
    console.log("\n" + "=".repeat(68));
    console.log("🟢 [WHATSAPP DEV SIMULATOR — OUTBOUND MESSAGE]");
    console.log(`📱 To: +91 ${to}`);
    console.log(`⏱️  Timestamp: ${new Date().toLocaleString("en-IN")}`);
    console.log(`🏷️  Context: ${options?.context?.type || "GENERAL"}`);
    if (options?.context?.referenceId) {
      console.log(`🔗 Reference: ${options.context.referenceId}`);
    }
    console.log("-".repeat(68));
    console.log(text);
    console.log("=".repeat(68) + "\n");

    try {
      await createWhatsAppMessageRepo({
        direction: "OUTBOUND",
        senderPhone: "NIVAASA_OFFICIAL",
        recipientPhone: to,
        body: text,
        messageType: "TEXT",
        status: "DELIVERED",
        provider: "SIMULATOR",
        metaMessageId: messageId,
        tenant: options?.tenantId || null,
        organizationId: options?.organizationId || null,
        context: options?.context || { type: "GENERAL" },
        metadata: options?.metadata || {},
      });
    } catch (err: any) {
      console.warn("Could not persist simulated WhatsApp message:", err?.message);
    }

    return {
      success: true,
      messageId,
      status: "DELIVERED",
      recipientPhone: to,
      body: text,
      provider: "SIMULATOR",
    };
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult> {
    const messageId = `sim_tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const simulatedBody = `[Template: ${templateName} (${languageCode})] ${JSON.stringify(components)}`;

    console.log("\n" + "=".repeat(68));
    console.log("🟢 [WHATSAPP DEV SIMULATOR — TEMPLATE MESSAGE]");
    console.log(`📱 To: +91 ${to}`);
    console.log(`📋 Template: ${templateName} (${languageCode})`);
    console.log(`📦 Components: ${JSON.stringify(components)}`);
    console.log("=".repeat(68) + "\n");

    try {
      await createWhatsAppMessageRepo({
        direction: "OUTBOUND",
        senderPhone: "NIVAASA_OFFICIAL",
        recipientPhone: to,
        body: simulatedBody,
        messageType: "TEMPLATE",
        templateName,
        status: "DELIVERED",
        provider: "SIMULATOR",
        metaMessageId: messageId,
        tenant: options?.tenantId || null,
        organizationId: options?.organizationId || null,
        context: options?.context || { type: "GENERAL" },
        metadata: { components, languageCode, ...(options?.metadata || {}) },
      });
    } catch (err: any) {
      console.warn("Could not persist simulated WhatsApp template:", err?.message);
    }

    return {
      success: true,
      messageId,
      status: "DELIVERED",
      recipientPhone: to,
      body: simulatedBody,
      provider: "SIMULATOR",
    };
  }
}

