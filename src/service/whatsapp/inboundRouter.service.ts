import {
  findTenantByPhoneNumberRepo,
  createWhatsAppMessageRepo,
  findLatestRentHistoryByTenantRepo,
  normalizePhoneNumber,
} from "../../repository/whatsapp.repository";
import { classifyMaintenanceMessage } from "../maintenance/aiClassifier.service";
import { createMaintenanceTicketRepo } from "../../repository/maintenance.repository";
import { generateKycTokenData } from "../kyc/kyc.service";
const Tenant = require("../../models/Tenant");

export interface InboundMessagePayload {
  from: string;
  body: string;
  messageId?: string;
  timestamp?: string | number;
  rawPayload?: any;
}

export interface InboundProcessingResult {
  tenant: any | null;
  intent: "MAINTENANCE" | "RENT_INQUIRY" | "RECEIPT_REQUEST" | "KYC_INQUIRY" | "HELP_GREETING" | "UNRECOGNIZED_TENANT";
  incomingMessage: string;
  replyMessage: string;
  ticketCreated?: any;
  status: "PROCESSED";
}

export const handleInboundWhatsAppMessage = async (
  payload: InboundMessagePayload,
  sendReplyFn: (to: string, text: string, options?: any) => Promise<any>,
): Promise<InboundProcessingResult> => {
  const { from, body, messageId, rawPayload } = payload;
  const cleanBody = (body || "").trim();
  const normalizedPhone = normalizePhoneNumber(from);

  // 1. Record incoming WhatsApp message in database
  let inboundDoc: any = null;
  try {
    inboundDoc = await createWhatsAppMessageRepo({
      direction: "INBOUND",
      senderPhone: normalizedPhone,
      recipientPhone: "NIVAASA_OFFICIAL",
      body: cleanBody,
      messageType: "TEXT",
      status: "RECEIVED",
      metaMessageId: messageId || `in_${Date.now()}`,
      metadata: rawPayload || {},
    });
  } catch (err) {
    console.warn("Could not save inbound WhatsApp message:", err);
  }

  // 2. Identify active tenant by phone number
  const tenant = await findTenantByPhoneNumberRepo(normalizedPhone);

  if (!tenant) {
    const unregReply = `🙏 *Namaste! Welcome to Nivaasa (निवास).*

Aapka mobile number (+91 ${normalizedPhone}) kisi active flat se linked nahi hai.
Agar aap ek resident hain, toh kripya apne building property manager se contact karein taaki aapka number register ho sake.`;

    await sendReplyFn(normalizedPhone, unregReply, {
      context: { type: "BOT_REPLY" },
    });

    return {
      tenant: null,
      intent: "UNRECOGNIZED_TENANT",
      incomingMessage: cleanBody,
      replyMessage: unregReply,
      status: "PROCESSED",
    };
  }

  // Attach tenant details to inbound record if it is a Mongoose document
  if (inboundDoc && typeof inboundDoc.save === "function") {
    try {
      inboundDoc.tenant = tenant._id;
      inboundDoc.organizationId = tenant.organizationId?._id || tenant.organizationId;
      await inboundDoc.save();
    } catch {}
  }

  const tenantOrgId = tenant.organizationId?._id || tenant.organizationId;
  const flatNumber = tenant.flat?.flatNumber || "N/A";
  const lowerBody = cleanBody.toLowerCase();

  // 3. Maintenance / Repair Intent
  const isMaintenance =
    /(tap|leak|paani|water|nalka|flush|toilet|commode|sink|pipe|drain|choke|sewer|bathroom|shower|light|fan|switch|socket|power|current|wire|bulb|fuse|inverter|bijli|spark|trip|door|lock|window|handle|almirah|drawer|wood|ac|geyser|cooler|washing|fridge|refrigerator|seepage|wall|paint|crack|tile|plaster|pest|cockroach|termite|rodent|rats|broken|kharab|chal nahi raha|repair|complaint|dikkat|problem)/i.test(
      lowerBody,
    );

  if (isMaintenance) {
    const analysis = await classifyMaintenanceMessage(cleanBody);
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const ticketNumber = `TKT-${dateStr}-${randSuffix}`;

    const ticket = await createMaintenanceTicketRepo({
      ticketNumber,
      title: analysis.title,
      description: cleanBody,
      category: analysis.category,
      urgency: analysis.urgency,
      status: "OPEN",
      source: "WHATSAPP",
      tenant: tenant._id,
      flat: tenant.flat?._id || tenant.flat,
      organizationId: tenantOrgId,
    });

    const reply = `🛠️ *Nivaasa Care Ticket Created*

Namaste ${tenant.name}! Aapki complaint darj kar li gayi hai.

📋 *Ticket ID:* #${ticketNumber}
🏷️ *Category:* ${analysis.category}
⚡ *Priority:* ${analysis.urgency}
📝 *Issue:* ${analysis.title}
🏠 *Flat:* ${flatNumber}

${analysis.acknowledgmentMessage}
Building manager ko notify kar diya gaya hai.`;

    await sendReplyFn(normalizedPhone, reply, {
      tenantId: tenant._id,
      organizationId: tenantOrgId,
      context: { type: "MAINTENANCE", referenceId: ticketNumber },
    });

    return {
      tenant,
      intent: "MAINTENANCE",
      incomingMessage: cleanBody,
      replyMessage: reply,
      ticketCreated: ticket,
      status: "PROCESSED",
    };
  }

  // 4. Receipt Request Intent (Checked before general rent inquiry so "rent receipt" routes to receipt)
  const isReceiptRequest = /(receipt|slip|bill|chalan|rasid|proof)/i.test(
    lowerBody,
  );

  if (isReceiptRequest) {
    const lastRent = await findLatestRentHistoryByTenantRepo(tenant._id);

    let reply = "";
    if (lastRent) {
      const modeFormatted = (lastRent.paymentMode || "CASH").replace("_", " ");
      reply = `🧾 *Latest Rent Receipt*

Receipt No: ${lastRent.receiptNumber || "N/A"}
Flat: ${flatNumber} | ${tenant.name}
Amount Received: ₹${lastRent.amountPaid?.toLocaleString("en-IN")} via ${modeFormatted}
Period: ${lastRent.rentMonth} ${lastRent.rentYear}
Date: ${new Date(lastRent.paymentDate).toLocaleDateString("en-IN")}
Remaining Balance: ₹${(tenant.pendingBalance || 0).toLocaleString("en-IN")}

Thank you for your payment!`;
    } else {
      reply = `🧾 *Rent Receipt*

Namaste ${tenant.name}! Aapke record mein abhi tak koi digital rent receipt darj nahi hui hai.
Kripya property manager se sampark karein.`;
    }

    await sendReplyFn(normalizedPhone, reply, {
      tenantId: tenant._id,
      organizationId: tenantOrgId,
      context: { type: "RENT_RECEIPT" },
    });

    return {
      tenant,
      intent: "RECEIPT_REQUEST",
      incomingMessage: cleanBody,
      replyMessage: reply,
      status: "PROCESSED",
    };
  }

  // 5. Rent Status & Dues Intent
  const isRentInquiry =
    /(rent|balance|paisa|kitna|dues|hisab|pending|bharna|due date|payment)/i.test(
      lowerBody,
    );

  if (isRentInquiry) {
    const balance = tenant.pendingBalance || 0;
    const isClear = balance === 0;

    let reply = "";
    if (isClear) {
      reply = `🏠 *Nivaasa Rent Status*

Namaste ${tenant.name}!
Flat: ${flatNumber}
Monthly Rent: ₹${tenant.monthlyRent?.toLocaleString("en-IN")}
Pending Balance: ₹0
Status: ✅ *All Clear (Koi बकाया nahi hai)*

Last Paid Month: ${tenant.lastPaidMonth || "Current Month"} ${tenant.lastPaidYear || ""}
Latest receipt dekhne ke liye "Receipt" reply karein.`;
    } else {
      reply = `🏠 *Nivaasa Rent Status*

Namaste ${tenant.name}!
Flat: ${flatNumber}
Monthly Rent: ₹${tenant.monthlyRent?.toLocaleString("en-IN")}
⚠️ *Pending Balance: ₹${balance.toLocaleString("en-IN")}*

Aap direct UPI, Cash, ya Bank Transfer se payment kar sakte hain. Payment hone par admin turant receipt issue karenge.`;
    }

    await sendReplyFn(normalizedPhone, reply, {
      tenantId: tenant._id,
      organizationId: tenantOrgId,
      context: { type: "RENT_REMINDER" },
    });

    return {
      tenant,
      intent: "RENT_INQUIRY",
      incomingMessage: cleanBody,
      replyMessage: reply,
      status: "PROCESSED",
    };
  }

  // 6. KYC Inquiry Intent
  const isKycInquiry = /(kyc|aadhar|verify|onboard|document)/i.test(lowerBody);

  if (isKycInquiry) {
    let reply = "";
    if (tenant.kycStatus === "VERIFIED") {
      reply = `✅ *Nivaasa KYC Verification*

Namaste ${tenant.name}!
Aapka Aadhaar e-KYC pehle se *VERIFIED* hai.
Aapko dobara document verify karne ki zaroorat nahi hai. Sukhkari nivaas!`;
    } else {
      let token = tenant.kycToken;
      if (!token || (tenant.kycTokenExpires && new Date(tenant.kycTokenExpires) < new Date())) {
        const tokenData = generateKycTokenData();
        token = tokenData.token;
        try {
          await Tenant.findByIdAndUpdate(tenant._id, {
            kycToken: tokenData.token,
            kycTokenExpires: tokenData.expiresAt,
            kycStatus: "PENDING",
          });
        } catch {
          // Silent during unit tests or disconnected db
        }
      }
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const kycLink = `${baseUrl}/kyc/${token}`;

      reply = `🪪 *Nivaasa Aadhaar e-KYC Verification*

Namaste ${tenant.name}! Flat ${flatNumber} onboarding ke liye bas 1 minute mein KYC complete karein:

🔗 ${kycLink}

Aadhaar OTP se turant verify hota hai (Zero paper, zero hassle).`;
    }

    await sendReplyFn(normalizedPhone, reply, {
      tenantId: tenant._id,
      organizationId: tenantOrgId,
      context: { type: "ONBOARDING" },
    });

    return {
      tenant,
      intent: "KYC_INQUIRY",
      incomingMessage: cleanBody,
      replyMessage: reply,
      status: "PROCESSED",
    };
  }

  // 7. General Greeting / Help Menu (Default)
  const helpReply = `🙏 *Namaste ${tenant.name}! Nivaasa Resident Assistant mein aapka swagat hai.*

Aap mujhse WhatsApp par in cheezon ke liye sampark kar sakte hain:
1️⃣ *Maintenance* — "Kitchen sink tap leak ho raha hai" ya "Fan kharab hai"
2️⃣ *Rent Status* — "Rent kitna baaki hai?"
3️⃣ *Receipt* — "Last receipt bhejo"
4️⃣ *KYC* — "KYC link chahiye"

Bas apni query yahan type karein!`;

  await sendReplyFn(normalizedPhone, helpReply, {
    tenantId: tenant._id,
    organizationId: tenantOrgId,
    context: { type: "BOT_REPLY" },
  });

  return {
    tenant,
    intent: "HELP_GREETING",
    incomingMessage: cleanBody,
    replyMessage: helpReply,
    status: "PROCESSED",
  };
};
