import type { Types } from "mongoose";
import { idString, toObjectId } from "../../core/db/objectId";
import { enqueueJob, registerJobHandler } from "../../core/queue/jobQueue";
import { formatInr } from "../../core/utils/money";
import { BUSINESS_TIMEZONE } from "../../core/utils/period";
import { normalizePhone } from "../../core/utils/text";
import { getWhatsAppProvider } from "./whatsapp.providers";
import { WhatsAppMessage, type MessageContext } from "./whatsappMessage.model";

export interface WhatsAppSendJob {
  to: string;
  text: string;
  tenantId: string | null;
  organizationId: string | null;
  context: { type: MessageContext; referenceId: string | null };
}

declare module "../../core/queue/jobQueue" {
  interface JobRegistry {
    "whatsapp.send": WhatsAppSendJob;
  }
}

/** Job handler: sends via the active provider and logs the message. */
export const deliverWhatsApp = async (job: WhatsAppSendJob): Promise<void> => {
  const provider = getWhatsAppProvider();
  const result = await provider.sendText(job.to, job.text);
  await WhatsAppMessage.create({
    direction: "OUTBOUND",
    senderPhone: "NIVAASA_OFFICIAL",
    recipientPhone: normalizePhone(job.to),
    body: job.text,
    status: result.status,
    provider: result.provider,
    metaMessageId: result.messageId,
    tenant: job.tenantId ? toObjectId(job.tenantId) : null,
    organizationId: job.organizationId ? toObjectId(job.organizationId) : null,
    context: job.context,
  });
};

registerJobHandler("whatsapp.send", deliverWhatsApp);

/** Queues an outbound WhatsApp message (non-blocking, retried on failure). */
export const queueWhatsAppText = (job: WhatsAppSendJob): Promise<void> =>
  enqueueJob("whatsapp.send", job);

// ── Message templates ────────────────────────────────────────────────────
interface Recipient {
  _id: Types.ObjectId | string;
  name: string;
  contactNumber: string | null;
}

const recipientJob = (
  tenant: Recipient,
  organizationId: string,
  text: string,
  context: WhatsAppSendJob["context"],
): WhatsAppSendJob | null =>
  tenant.contactNumber
    ? {
        to: normalizePhone(tenant.contactNumber),
        text,
        tenantId: idString(tenant._id),
        organizationId,
        context,
      }
    : null;

export const onboardingMessage = (
  tenant: Recipient,
  organizationId: string,
  flatNumber: string,
  kycLink: string,
) =>
  recipientJob(
    tenant,
    organizationId,
    `Welcome ${tenant.name}! Flat ${flatNumber} onboarding ke liye bas 1 minute mein KYC complete karein:\n🔗 ${kycLink}\n\n(Zero app download, zero password - Aadhaar OTP se turant verify karein)`,
    { type: "ONBOARDING", referenceId: idString(tenant._id) },
  );

export const receiptText = (params: {
  receiptNumber: string;
  flatNumber: string;
  tenantName: string;
  amountPaise: number;
  paymentMode: string;
  periodLabel: string;
  remainingPaise: number;
  paymentDate: Date;
}): string =>
  `🧾 *RENT RECEIPT #${params.receiptNumber}*\n\nFlat: ${params.flatNumber} | ${params.tenantName}\nAmount Received: ${formatInr(params.amountPaise)} via ${params.paymentMode.replace(/_/g, " ")}\nPeriod: ${params.periodLabel}\nRemaining Balance: ${formatInr(Math.max(0, params.remainingPaise))}\nDate: ${params.paymentDate.toLocaleDateString("en-IN", { timeZone: BUSINESS_TIMEZONE })}\n\nThank you for your payment! 🙏`;

export const receiptMessage = (
  tenant: Recipient,
  organizationId: string,
  text: string,
  receiptNumber: string,
) =>
  recipientJob(tenant, organizationId, text, {
    type: "RENT_RECEIPT",
    referenceId: receiptNumber,
  });

const STATUS_LABELS: Record<string, string> = {
  OPEN: "🟡 Open",
  IN_PROGRESS: "🔵 Work In Progress",
  RESOLVED: "🟢 Resolved ✓",
  CLOSED: "⚪ Closed",
};

export const maintenanceUpdateText = (params: {
  tenantName: string;
  ticketNumber: string;
  title: string;
  flatNumber: string;
  status: string;
  notes?: string | undefined;
}): string =>
  `🛠️ *Maintenance Update #${params.ticketNumber}*\n\nNamaste ${params.tenantName}!\nFlat: ${params.flatNumber}\nAapki complaint "${params.title}" ka status update ho gaya hai:\n*Status:* ${STATUS_LABELS[params.status] ?? params.status}${params.notes ? `\n\nNote: ${params.notes}` : ""}\n\nNivaasa Care Team`;

export const maintenanceUpdateMessage = (
  tenant: Recipient,
  organizationId: string,
  text: string,
  ticketNumber: string,
) =>
  recipientJob(tenant, organizationId, text, {
    type: "MAINTENANCE",
    referenceId: ticketNumber,
  });
