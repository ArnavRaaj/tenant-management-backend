import { Types } from "mongoose";
import { idString } from "../../core/db/objectId";
import { registerJobHandler } from "../../core/queue/jobQueue";
import { logger } from "../../core/logger";
import { decryptOrNull } from "../../core/security/crypto";
import { formatInr } from "../../core/utils/money";
import { BUSINESS_TIMEZONE, periodLabel } from "../../core/utils/period";
import { normalizePhone } from "../../core/utils/text";
import { issueKycToken, kycLinkFor, storedKycToken } from "../kyc/kyc.tokens";
import { looksLikeMaintenance } from "../maintenance/aiClassifier";
import { createTicketForTenant } from "../maintenance/maintenance.service";
import { contactHash } from "../tenants/tenant.service";
import type { TenantRecord } from "../tenants/tenant.mapper";
import { Tenant } from "../tenants/tenant.model";
import { rentRepository, tenantRepository } from "../tenants/tenant.repository";
import { queueWhatsAppText, type WhatsAppSendJob } from "./whatsapp.service";
import { WhatsAppMessage } from "./whatsappMessage.model";

export interface InboundMessage {
  from: string;
  body: string;
  messageId: string;
}

export type InboundIntent =
  | "MAINTENANCE"
  | "RENT_INQUIRY"
  | "RECEIPT_REQUEST"
  | "KYC_INQUIRY"
  | "HELP_GREETING"
  | "UNRECOGNIZED_TENANT";

export interface InboundResult {
  intent: InboundIntent;
  tenantId: string | null;
  replyMessage: string;
  ticketNumber: string | null;
}

declare module "../../core/queue/jobQueue" {
  interface JobRegistry {
    "whatsapp.inbound": InboundMessage;
  }
}

// Word-boundary intent patterns (substring matching caused false positives).
const RECEIPT = /\b(receipt|slip|bill|chalan|challan|rasid|raseed|proof)\b/i;
const RENT =
  /\b(rent|kiraya|balance|paisa|paise|kitna|dues|hisab|hisaab|pending|bharna|due date|payment|baaki|baki)\b/i;
const KYC =
  /\b(kyc|aadha?ar|verify|verification|onboard|onboarding|document)\b/i;

const flatNumberOf = (t: TenantRecord) =>
  t.flat && !(t.flat instanceof Types.ObjectId) ? t.flat.flatNumber : "N/A";

const kycLinkForTenant = async (tenant: TenantRecord): Promise<string> => {
  const stored = storedKycToken(tenant.kycTokenEnc);
  if (
    stored &&
    tenant.kycTokenExpires &&
    tenant.kycTokenExpires.getTime() > Date.now()
  ) {
    return kycLinkFor(stored);
  }
  const issued = issueKycToken(tenant.organizationId.toHexString());
  await Tenant.updateOne(
    { _id: tenant._id, organizationId: tenant.organizationId },
    {
      $set: {
        kycTokenHash: issued.kycTokenHash,
        kycTokenEnc: issued.kycTokenEnc,
        kycTokenExpires: issued.kycTokenExpires,
      },
    },
  );
  return kycLinkFor(issued.token);
};

const buildReply = async (
  tenant: TenantRecord,
  text: string,
): Promise<{
  intent: InboundIntent;
  reply: string;
  ticketNumber: string | null;
  context: WhatsAppSendJob["context"];
}> => {
  const flatNumber = flatNumberOf(tenant);

  if (looksLikeMaintenance(text)) {
    const { ticket, analysis } = await createTicketForTenant({
      tenant,
      description: text,
      source: "WHATSAPP",
      createdBy: null,
    });
    return {
      intent: "MAINTENANCE",
      ticketNumber: ticket.ticketNumber,
      context: { type: "MAINTENANCE", referenceId: ticket.ticketNumber },
      reply: `🛠️ *Nivaasa Care Ticket Created*\n\nNamaste ${tenant.name}! Aapki complaint darj kar li gayi hai.\n\n📋 *Ticket ID:* #${ticket.ticketNumber}\n🏷️ *Category:* ${ticket.category}\n⚡ *Priority:* ${ticket.urgency}\n📝 *Issue:* ${ticket.title}\n🏠 *Flat:* ${flatNumber}\n\n${analysis.acknowledgmentMessage}`,
    };
  }

  if (RECEIPT.test(text)) {
    const last = await rentRepository.latestForTenant(
      tenant._id,
      tenant.organizationId,
    );
    const reply = last
      ? `🧾 *Latest Rent Receipt*\n\nReceipt No: ${last.receiptNumber}\nFlat: ${flatNumber} | ${tenant.name}\nAmount Received: ${formatInr(last.amountPaid)} via ${last.paymentMode.replace(/_/g, " ")}\nPeriod: ${periodLabel(last.period)}\nDate: ${last.paymentDate.toLocaleDateString("en-IN", { timeZone: BUSINESS_TIMEZONE })}\nRemaining Balance: ${formatInr(Math.max(0, tenant.pendingBalance))}\n\nThank you for your payment!`
      : `🧾 *Rent Receipt*\n\nNamaste ${tenant.name}! Aapke record mein abhi tak koi digital rent receipt darj nahi hui hai.\nKripya property manager se sampark karein.`;
    return {
      intent: "RECEIPT_REQUEST",
      reply,
      ticketNumber: null,
      context: {
        type: "RENT_RECEIPT",
        referenceId: last?.receiptNumber ?? null,
      },
    };
  }

  if (RENT.test(text)) {
    const clear = tenant.pendingBalance <= 0;
    const reply = clear
      ? `🏠 *Nivaasa Rent Status*\n\nNamaste ${tenant.name}!\nFlat: ${flatNumber}\nMonthly Rent: ${formatInr(tenant.monthlyRent)}\nPending Balance: ₹0\nStatus: ✅ *All Clear*\n\nLast Paid: ${tenant.lastPaidPeriod ? periodLabel(tenant.lastPaidPeriod) : "—"}\nLatest receipt dekhne ke liye "Receipt" reply karein.`
      : `🏠 *Nivaasa Rent Status*\n\nNamaste ${tenant.name}!\nFlat: ${flatNumber}\nMonthly Rent: ${formatInr(tenant.monthlyRent)}\n⚠️ *Pending Balance: ${formatInr(tenant.pendingBalance)}*\n\nAap direct UPI, Cash, ya Bank Transfer se payment kar sakte hain. Payment hone par admin turant receipt issue karenge.`;
    return {
      intent: "RENT_INQUIRY",
      reply,
      ticketNumber: null,
      context: { type: "RENT_REMINDER", referenceId: null },
    };
  }

  if (KYC.test(text)) {
    const reply =
      tenant.kycStatus === "VERIFIED"
        ? `✅ *Nivaasa KYC Verification*\n\nNamaste ${tenant.name}!\nAapka Aadhaar e-KYC pehle se *VERIFIED* hai.`
        : `🪪 *Nivaasa Aadhaar e-KYC Verification*\n\nNamaste ${tenant.name}! Flat ${flatNumber} onboarding ke liye bas 1 minute mein KYC complete karein:\n\n🔗 ${await kycLinkForTenant(tenant)}\n\nAadhaar OTP se turant verify hota hai.`;
    return {
      intent: "KYC_INQUIRY",
      reply,
      ticketNumber: null,
      context: { type: "ONBOARDING", referenceId: null },
    };
  }

  return {
    intent: "HELP_GREETING",
    ticketNumber: null,
    context: { type: "BOT_REPLY", referenceId: null },
    reply: `🙏 *Namaste ${tenant.name}! Nivaasa Resident Assistant mein aapka swagat hai.*\n\nAap mujhse WhatsApp par in cheezon ke liye sampark kar sakte hain:\n1️⃣ *Maintenance* — "Kitchen sink tap leak ho raha hai"\n2️⃣ *Rent Status* — "Rent kitna baaki hai?"\n3️⃣ *Receipt* — "Last receipt bhejo"\n4️⃣ *KYC* — "KYC link chahiye"\n\nBas apni query yahan type karein!`,
  };
};

/**
 * Routes an inbound tenant message: identifies the tenant via the phone
 * blind index (an indexed lookup — no decrypt-and-scan), detects intent,
 * acts, and queues the reply.
 */
export const handleInboundMessage = async (
  msg: InboundMessage,
): Promise<InboundResult> => {
  const phone = normalizePhone(msg.from);
  const text = msg.body.trim().slice(0, 2000);

  const tenant = phone
    ? await tenantRepository.findActiveByContactHash(contactHash(phone))
    : null;

  await WhatsAppMessage.create({
    direction: "INBOUND",
    senderPhone: phone || "unknown",
    recipientPhone: "NIVAASA_OFFICIAL",
    body: text || "(empty)",
    status: "RECEIVED",
    metaMessageId: msg.messageId,
    tenant: tenant?._id ?? null,
    organizationId: tenant?.organizationId ?? null,
  });

  if (!tenant) {
    const reply = `🙏 *Namaste! Welcome to Nivaasa (निवास).*\n\nAapka mobile number kisi active flat se linked nahi hai.\nAgar aap resident hain, toh kripya apne property manager se contact karein.`;
    if (phone) {
      await queueWhatsAppText({
        to: phone,
        text: reply,
        tenantId: null,
        organizationId: null,
        context: { type: "BOT_REPLY", referenceId: null },
      });
    }
    return {
      intent: "UNRECOGNIZED_TENANT",
      tenantId: null,
      replyMessage: reply,
      ticketNumber: null,
    };
  }

  const { intent, reply, ticketNumber, context } = await buildReply(
    tenant,
    text,
  );
  const to = normalizePhone(decryptOrNull(tenant.contactNumber)) || phone;
  await queueWhatsAppText({
    to,
    text: reply,
    tenantId: idString(tenant._id),
    organizationId: tenant.organizationId.toHexString(),
    context,
  });
  return {
    intent,
    tenantId: idString(tenant._id),
    replyMessage: reply,
    ticketNumber,
  };
};

registerJobHandler("whatsapp.inbound", async (msg) => {
  // Meta retries webhooks: skip messages we have already processed.
  if (
    await WhatsAppMessage.exists({
      metaMessageId: msg.messageId,
      direction: "INBOUND",
    })
  ) {
    logger.debug(
      { messageId: msg.messageId },
      "Duplicate inbound message skipped",
    );
    return;
  }
  await handleInboundMessage(msg);
});

export const updateDeliveryStatus = async (
  metaMessageId: string,
  status: string,
) => {
  const allowed = ["SENT", "DELIVERED", "READ", "FAILED"];
  if (!allowed.includes(status)) return;
  await WhatsAppMessage.updateOne(
    { metaMessageId, direction: "OUTBOUND" },
    { $set: { status } },
  );
};
