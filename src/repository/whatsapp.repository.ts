const WhatsAppMessage = require("../models/WhatsAppMessage");
const Tenant = require("../models/Tenant");
const RentHistory = require("../models/RentHistory");
import { decryptTenantFields } from "../utils/encryption";

export const createWhatsAppMessageRepo = async (data: any) => {
  return await WhatsAppMessage.create(data);
};

export const findWhatsAppMessagesRepo = async (
  filter: any,
  limit: number = 50,
  skip: number = 0,
) => {
  return await WhatsAppMessage.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("tenant", "name contactNumber kycStatus")
    .populate("organizationId", "name email");
};

export const countWhatsAppMessagesRepo = async (filter: any) => {
  return await WhatsAppMessage.countDocuments(filter);
};

export const updateWhatsAppMessageStatusRepo = async (
  metaMessageId: string,
  status: string,
) => {
  return await WhatsAppMessage.findOneAndUpdate(
    { metaMessageId },
    { status },
    { new: true },
  );
};

/**
 * Normalizes an Indian phone number to its last 10 digits
 */
export const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
};

/**
 * Searches for an active tenant by matching their phone number
 * Handles decrypted comparisons across active tenants.
 */
export const findTenantByPhoneNumberRepo = async (rawPhone: string) => {
  const targetPhone = normalizePhoneNumber(rawPhone);
  if (!targetPhone) return null;

  // Retrieve active tenants with populated flat and organization
  const activeTenants = await Tenant.find({ isActive: true })
    .populate("flat", "flatNumber floor buildingName")
    .populate("organizationId", "name email")
    .lean();

  for (const tenantDoc of activeTenants) {
    const decrypted = decryptTenantFields(tenantDoc);
    const tenantPhone = normalizePhoneNumber(decrypted.contactNumber);
    if (tenantPhone === targetPhone) {
      return decrypted;
    }
  }

  return null;
};

/**
 * Retrieves the latest rent payment history for a tenant
 */
export const findLatestRentHistoryByTenantRepo = async (tenantId: string) => {
  return await RentHistory.findOne({ tenant: tenantId }).sort({
    paymentDate: -1,
  });
};

