import { IWhatsAppProvider } from "./whatsappProvider.interface";
import { SimulatorWhatsAppProvider } from "./simulatorWhatsAppProvider";
import { MetaCloudWhatsAppProvider } from "./metaCloudWhatsAppProvider";
import {
  handleInboundWhatsAppMessage,
  InboundMessagePayload,
} from "./inboundRouter.service";

let activeProvider: IWhatsAppProvider | null = null;

export const getWhatsAppProvider = (): IWhatsAppProvider => {
  const providerType = (process.env.WHATSAPP_PROVIDER || "simulator").toLowerCase();

  if (providerType === "meta") {
    if (!activeProvider || activeProvider.name !== "META") {
      activeProvider = new MetaCloudWhatsAppProvider();
    }
  } else {
    if (!activeProvider || activeProvider.name !== "SIMULATOR") {
      activeProvider = new SimulatorWhatsAppProvider();
    }
  }

  return activeProvider;
};

export const sendWhatsAppText = async (
  to: string,
  text: string,
  options?: any,
) => {
  const provider = getWhatsAppProvider();
  return await provider.sendTextMessage(to, text, options);
};

export const sendWhatsAppTemplate = async (
  to: string,
  templateName: string,
  languageCode: string,
  components: any[],
  options?: any,
) => {
  const provider = getWhatsAppProvider();
  return await provider.sendTemplateMessage(
    to,
    templateName,
    languageCode,
    components,
    options,
  );
};

/**
 * 1. Outbound: Tenant Flat Assignment & KYC Onboarding
 * e.g. "Welcome Rahul! Flat 302 onboarding ke liye bas 1 minute mein KYC complete karein [1-Click Link]"
 */
export const sendTenantOnboardingWhatsApp = async (params: {
  tenant: any;
  flatNumber: string | number;
  kycLink: string;
  organizationId?: string;
}) => {
  const { tenant, flatNumber, kycLink, organizationId } = params;
  const phone = tenant.contactNumber;

  const text = `Welcome ${tenant.name}! Flat ${flatNumber} onboarding ke liye bas 1 minute mein KYC complete karein:
🔗 ${kycLink}

(Zero app download, zero password - Aadhaar OTP se turant verify karein)`;

  return await sendWhatsAppText(phone, text, {
    tenantId: tenant._id,
    organizationId: organizationId || tenant.organizationId?._id || tenant.organizationId,
    context: {
      type: "ONBOARDING",
      referenceId: String(tenant._id),
    },
  });
};

/**
 * 2. Outbound: Instant Digital Rent Payment Receipt
 */
export const sendRentReceiptWhatsApp = async (params: {
  tenant: any;
  receiptNumber: string;
  amountPaid: number;
  paymentMode: string;
  rentMonth: string;
  rentYear: number | string;
  remainingBalance: number;
  organizationId?: string;
}) => {
  const {
    tenant,
    receiptNumber,
    amountPaid,
    paymentMode,
    rentMonth,
    rentYear,
    remainingBalance,
    organizationId,
  } = params;

  const phone = tenant.contactNumber;
  const flatNumber = tenant.flat?.flatNumber || "N/A";
  const modeFormatted = (paymentMode || "CASH").replace("_", " ");
  const dateStr = new Date().toLocaleDateString("en-IN");

  const receiptText = `🧾 *RENT RECEIPT #${receiptNumber}*

Flat: ${flatNumber} | ${tenant.name}
Amount Received: ₹${amountPaid.toLocaleString("en-IN")} via ${modeFormatted}
Period: ${rentMonth} ${rentYear}
Remaining Balance: ₹${remainingBalance.toLocaleString("en-IN")}
Date: ${dateStr}

Thank you for your payment at Nivaasa! 🙏`;

  return await sendWhatsAppText(phone, receiptText, {
    tenantId: tenant._id,
    organizationId: organizationId || tenant.organizationId?._id || tenant.organizationId,
    context: {
      type: "RENT_RECEIPT",
      referenceId: receiptNumber,
    },
  });
};

/**
 * 3. Outbound: Gentle Rent Reminder
 */
export const sendRentReminderWhatsApp = async (params: {
  tenant: any;
  pendingBalance: number;
  dueDateStr?: string;
  organizationId?: string;
}) => {
  const { tenant, pendingBalance, dueDateStr, organizationId } = params;
  const phone = tenant.contactNumber;
  const flatNumber = tenant.flat?.flatNumber || "N/A";

  const text = `🏠 *Nivaasa Monthly Rent Reminder*

Namaste ${tenant.name}!
Flat: ${flatNumber}
Pending Rent Due: ₹${pendingBalance.toLocaleString("en-IN")}
${dueDateStr ? `Due Date: ${dueDateStr}` : "Kindly clear at your earliest convenience."}

Aap cash, direct UPI, ya bank transfer se payment kar sakte hain. Payment hone ke baad digital receipt WhatsApp par bhej di jaayegi.`;

  return await sendWhatsAppText(phone, text, {
    tenantId: tenant._id,
    organizationId: organizationId || tenant.organizationId?._id || tenant.organizationId,
    context: {
      type: "RENT_REMINDER",
      referenceId: String(tenant._id),
    },
  });
};

/**
 * 4. Outbound: Maintenance Ticket Status Update
 */
export const sendMaintenanceUpdateWhatsApp = async (params: {
  tenant: any;
  ticketNumber: string;
  title: string;
  status: string;
  notes?: string;
  organizationId?: string;
}) => {
  const { tenant, ticketNumber, title, status, notes, organizationId } = params;
  const phone = tenant.contactNumber;

  const statusIcons: Record<string, string> = {
    OPEN: "🟡 Assigned",
    IN_PROGRESS: "🔵 Work In Progress",
    RESOLVED: "🟢 Resolved ✓",
    CANCELLED: "⚪ Cancelled",
  };

  const text = `🛠️ *Maintenance Update #${ticketNumber}*

Namaste ${tenant.name}!
Aapki complaint "${title}" ka status update ho gaya hai:
*Status:* ${statusIcons[status] || status}
${notes ? `\nNote: ${notes}` : ""}

Nivaasa Care Team`;

  return await sendWhatsAppText(phone, text, {
    tenantId: tenant._id,
    organizationId: organizationId || tenant.organizationId?._id || tenant.organizationId,
    context: {
      type: "MAINTENANCE",
      referenceId: ticketNumber,
    },
  });
};

/**
 * 5. Inbound Webhook Processor
 */
export const processInboundWhatsApp = async (
  payload: InboundMessagePayload,
) => {
  return await handleInboundWhatsAppMessage(payload, sendWhatsAppText);
};

