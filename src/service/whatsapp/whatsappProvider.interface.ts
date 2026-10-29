export interface WhatsAppSendOptions {
  organizationId?: string;
  tenantId?: string;
  context?: {
    type:
      | "ONBOARDING"
      | "RENT_RECEIPT"
      | "RENT_REMINDER"
      | "MAINTENANCE"
      | "BOT_REPLY"
      | "GENERAL";
    referenceId?: string;
  };
  metadata?: Record<string, any>;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  status: "SENT" | "DELIVERED" | "FAILED" | "SIMULATED";
  recipientPhone: string;
  body: string;
  provider: "SIMULATOR" | "META";
  error?: string;
  details?: any;
}

export interface IWhatsAppProvider {
  name: "SIMULATOR" | "META";
  sendTextMessage(
    to: string,
    text: string,
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult>;
  sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
    options?: WhatsAppSendOptions,
  ): Promise<WhatsAppSendResult>;
}

