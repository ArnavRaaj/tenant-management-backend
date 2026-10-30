import { Request } from "express";
import {
  findTenantsRepo,
  createTenantRepo,
  updateTenantRepo,
  findTenantByIdRepo,
  createRentHistoryRepo,
  findRentHistoryByTenantRepo,
  findCurrentMonthRentHistoryRepo,
} from "../repository/tenant.repository";
import { getFlatRepo } from "../repository/flat.repository";
import {
  AppError,
  NotFoundError,
  ConflictError,
} from "../utils/AppError";
import { withTransaction } from "../utils/transactionRunner";
import {
  encrypt,
  ENCRYPTED_TENANT_FIELDS,
  encryptTenantFields,
  decryptTenantFields,
} from "../utils/encryption";
import { generateKycTokenData } from "./kyc/kyc.service";
import {
  sendTenantOnboardingWhatsApp,
  sendRentReceiptWhatsApp,
} from "./whatsapp/whatsapp.service";
const {
  uploadImage,
  buildTenantFolderPath,
} = require("../utils/cloudinary");

export const getTenantsService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const filter: any = { organizationId };
  if (req.query.status === "past") filter.isActive = false;
  else filter.isActive = true;

  if (req.query.rentDue === "true") filter.pendingBalance = { $gt: 0 };

  // Compute whether current month rent has been received
  const now = new Date();
  const currentMonth = now.toLocaleString("en-US", { month: "long" });
  const currentYear = now.getFullYear();
  const monthPrefix = currentMonth.substring(0, 3).toLowerCase();

  // Run both DB queries in parallel instead of sequentially
  const [tenants, currentMonthRecords] = await Promise.all([
    findTenantsRepo(filter),
    findCurrentMonthRentHistoryRepo(organizationId, currentMonth, currentYear),
  ]);
  const paidTenantIds = new Set(
    currentMonthRecords.map((r: any) => r.tenant?.toString()),
  );

  return tenants.map((tenantDoc: any) => {
    const decrypted = decryptTenantFields(tenantDoc);
    const tenantIdStr = (decrypted._id || decrypted.id)?.toString();
    const isPaidInHistory = paidTenantIds.has(tenantIdStr);
    const isPaidInDoc =
      Number(decrypted.lastPaidYear) === currentYear &&
      typeof decrypted.lastPaidMonth === "string" &&
      decrypted.lastPaidMonth.toLowerCase().startsWith(monthPrefix);

    const isCurrentMonthPaid = Boolean(isPaidInHistory || isPaidInDoc);

    return {
      ...decrypted,
      isCurrentMonthPaid,
    };
  });
};

export const getTenantService = async (req: Request) => {
  const organizationId = (req as any).organizationId;

  const now = new Date();
  const currentMonth = now.toLocaleString("en-US", { month: "long" });
  const currentYear = now.getFullYear();
  const monthPrefix = currentMonth.substring(0, 3).toLowerCase();

  // Run both DB queries in parallel
  const [tenant, currentMonthRecords] = await Promise.all([
    findTenantByIdRepo(req.params.id as string, organizationId),
    findCurrentMonthRentHistoryRepo(organizationId, currentMonth, currentYear),
  ]);

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  const decrypted = decryptTenantFields(tenant);
  const tenantIdStr = (decrypted._id || decrypted.id)?.toString();
  const isPaidInHistory = currentMonthRecords.some(
    (r: any) => r.tenant?.toString() === tenantIdStr,
  );
  const isPaidInDoc =
    Number(decrypted.lastPaidYear) === currentYear &&
    typeof decrypted.lastPaidMonth === "string" &&
    decrypted.lastPaidMonth.toLowerCase().startsWith(monthPrefix);

  const isCurrentMonthPaid = Boolean(isPaidInHistory || isPaidInDoc);

  return {
    ...decrypted,
    isCurrentMonthPaid,
  };
};

export const createTenantService = async (req: any, externalSession?: any) => {
  const execute = async (session?: any) => {
    const organizationId = req.organizationId;
    const {
      name,
      contactNumber,
      age,
      aadharNumber,
      gender,
      address,
      occupantsCount,
      securityDeposit,
      monthlyRent,
      pendingBalance,
      flatId,
      dateOfRenting,
    } = req.body;

    const flat = await getFlatRepo(flatId, organizationId, session);
    if (!flat) {
      throw new NotFoundError("Flat not found");
    }

    if (flat.currentTenant) {
      throw new ConflictError("Flat is already occupied");
    }

    let parsedAddress = address;
    if (typeof address === "string" && address.trim().startsWith("{")) {
      try {
        parsedAddress = JSON.parse(address);
      } catch {
        /* silent */
      }
    }

    const tenantData = encryptTenantFields({
      name,
      contactNumber,
      age,
      aadharNumber,
      gender,
      aadharImage: "",
      address: parsedAddress || {},
      occupantsCount,
      securityDeposit,
      monthlyRent,
      pendingBalance: pendingBalance || 0,
      flat: flatId,
      isActive: true,
      dateOfRenting: dateOfRenting || Date.now(),
    });

    // Generate secure KYC onboarding token (72h validity)
    const { token: kycToken, expiresAt: kycTokenExpires } = generateKycTokenData();
    tenantData.kycToken = kycToken;
    tenantData.kycTokenExpires = kycTokenExpires;
    tenantData.kycStatus = "PENDING";

    // Add organizationId unencrypted since it's a foreign key reference
    tenantData.organizationId = organizationId;

    const tenant = await createTenantRepo(tenantData, session);

    flat.currentTenant = tenant._id;
    if (session) {
      await flat.save({ session });
    } else {
      await flat.save();
    }

    if (req.file) {
      const folderPath = buildTenantFolderPath({
        orgName: req.user?.name,
        orgId: String(organizationId),
        floor: flat.floor ?? 0,
        tenantName: name,
        tenantId: String(tenant._id),
        category: "aadhar",
      });
      const result: any = await uploadImage(req.file.buffer, folderPath);
      tenant.aadharImage = encrypt(result.secure_url);
      if (session) {
        await tenant.save({ session });
      } else {
        await tenant.save();
      }
    }

    const decrypted = decryptTenantFields(tenant);
    const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    decrypted.kycLink = `${frontendBaseUrl}/kyc/${kycToken}`;
    
    // Dispatch instant 1-click WhatsApp onboarding message to tenant
    try {
      await sendTenantOnboardingWhatsApp({
        tenant: decrypted,
        flatNumber: flat.flatNumber,
        kycLink: decrypted.kycLink,
        organizationId,
      });
    } catch (whatsappErr: any) {
      console.warn("Could not dispatch WhatsApp onboarding:", whatsappErr?.message);
    }

    return decrypted;
  };

  if (externalSession) {
    return await execute(externalSession);
  }
  return await withTransaction(execute);
};

export const updateTenantService = async (req: any) => {
  const organizationId = req.organizationId;
  let tenant = await findTenantByIdRepo(
    req.params.id as string,
    organizationId,
  );
  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  let imageUrl = tenant.aadharImage;
  if (req.file) {
    try {
      const flat = await getFlatRepo(
        tenant.flat?._id || tenant.flat,
        organizationId,
      );
      const decryptedTenant = decryptTenantFields(tenant);
      const tenantName = req.body?.name || decryptedTenant.name;
      const folderPath = buildTenantFolderPath({
        orgName: req.user?.name,
        orgId: String(organizationId),
        floor: flat?.floor ?? 0,
        tenantName,
        tenantId: String(tenant._id),
        category: "aadhar",
      });
      const result: any = await uploadImage(req.file.buffer, folderPath);
      imageUrl = encrypt(result.secure_url);
    } catch (error) {
      console.error("Image upload failed", error);
      throw new AppError("Image upload failed", 500);
    }
  }

  // Encrypt sensitive fields from the request body
  const updateData = { ...req.body };
  if (
    typeof updateData.address === "string" &&
    updateData.address.trim().startsWith("{")
  ) {
    try {
      updateData.address = JSON.parse(updateData.address);
    } catch {
      /* silent */
    }
  }
  for (const field of ENCRYPTED_TENANT_FIELDS) {
    if (field === "aadharImage") continue; // handled separately above
    if (updateData[field]) {
      updateData[field] = encrypt(updateData[field]);
    }
  }
  updateData.aadharImage = imageUrl;

  tenant = await updateTenantRepo(
    req.params.id as string,
    updateData,
    organizationId,
  );
  return decryptTenantFields(tenant);
};

export const changeTenantService = async (req: any) => {
  return await withTransaction(async (session) => {
    const organizationId = req.organizationId;
    const currentTenant = await findTenantByIdRepo(
      req.params.id as string,
      organizationId,
      session,
    );
    if (!currentTenant) {
      throw new NotFoundError("Tenant not found");
    }

    const flatId = currentTenant.flat?._id || currentTenant.flat;
    const flat = await getFlatRepo(flatId, organizationId, session);
    if (!flat) {
      throw new NotFoundError("Flat not found");
    }

    // 1. Vacate old tenant atomically
    currentTenant.isActive = false;
    currentTenant.vacatedDate = Date.now();
    if (session) {
      await currentTenant.save({ session });
    } else {
      await currentTenant.save();
    }

    // 2. Clear current tenant from flat atomically
    flat.currentTenant = null;
    if (session) {
      await flat.save({ session });
    } else {
      await flat.save();
    }

    // 3. Register new tenant atomically in the same transaction
    req.body.flatId = flatId;
    const newTenant = await createTenantService(req, session);
    return newTenant;
  });
};

export const vacateTenantService = async (req: Request) => {
  return await withTransaction(async (session) => {
    const organizationId = (req as any).organizationId;
    const currentTenant = await findTenantByIdRepo(
      req.params.id as string,
      organizationId,
      session,
    );
    if (!currentTenant) {
      throw new NotFoundError("Tenant not found");
    }

    const flatId = currentTenant.flat?._id || currentTenant.flat;
    const flat = await getFlatRepo(flatId, organizationId, session);

    currentTenant.isActive = false;
    currentTenant.vacatedDate = Date.now();
    if (session) {
      await currentTenant.save({ session });
    } else {
      await currentTenant.save();
    }

    if (flat) {
      flat.currentTenant = null;
      if (session) {
        await flat.save({ session });
      } else {
        await flat.save();
      }
    }

    return { message: "Tenant vacated successfully and flat is now vacant" };
  });
};

export const addRentRecordService = async (req: Request) => {
  return await withTransaction(async (session) => {
    const organizationId = (req as any).organizationId;
    const tenant = await findTenantByIdRepo(
      req.params.id as string,
      organizationId,
      session,
    );
    if (!tenant) {
      throw new NotFoundError("Tenant not found");
    }

    const {
      amountPaid,
      rentMonth,
      rentYear,
      paymentDate,
      paymentMode,
      referenceId,
      notes,
    } = req.body;

    // Generate unique receipt number (e.g. REC-202610-8A2F)
    const pDate = new Date(paymentDate || Date.now());
    const monthStr = String(pDate.getMonth() + 1).padStart(2, "0");
    const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const receiptNumber = `REC-${pDate.getFullYear()}${monthStr}-${randSuffix}`;

    const rentRecord = await createRentHistoryRepo(
      {
        tenant: tenant._id,
        flat: tenant.flat?._id || tenant.flat,
        amountPaid,
        paymentDate: pDate,
        rentMonth,
        rentYear,
        paymentMode: paymentMode || "CASH",
        receiptNumber,
        referenceId: referenceId || "",
        notes: notes || "",
        organizationId,
      },
      session,
    );

    // Dynamic balance adjustment: reduce arrears if pending, otherwise track difference
    if (tenant.pendingBalance > 0) {
      tenant.pendingBalance = Math.max(0, tenant.pendingBalance - amountPaid);
    } else {
      const diff = tenant.monthlyRent - amountPaid;
      if (diff > 0) tenant.pendingBalance += diff;
    }

    // Payment pattern intelligence (On-time vs Mid-month vs Late)
    const dayOfMonth = pDate.getDate();
    if (dayOfMonth <= 5) {
      tenant.paymentPattern = "ON_TIME";
    } else if (dayOfMonth <= 15) {
      tenant.paymentPattern = "MID_MONTH";
    } else {
      tenant.paymentPattern = "CHRONIC_LATE";
    }

    // Update lastPaidMonth & lastPaidYear
    tenant.lastPaidMonth = rentMonth;
    tenant.lastPaidYear = Number(rentYear);

    if (session) {
      await tenant.save({ session });
    } else {
      await tenant.save();
    }

    const flatNumber = tenant.flat?.flatNumber || "N/A";
    const modeFormatted = (paymentMode || "CASH").replace("_", " ");
    const receiptText = `🧾 *RENT RECEIPT #${receiptNumber}*\n\nFlat: ${flatNumber} | ${tenant.name}\nAmount Received: ₹${amountPaid.toLocaleString("en-IN")} via ${modeFormatted}\nPeriod: ${rentMonth} ${rentYear}\nRemaining Balance: ₹${tenant.pendingBalance.toLocaleString("en-IN")}\nDate: ${pDate.toLocaleDateString("en-IN")}\n\nThank you for your payment!`;

    const now = new Date();
    const currentMonth = now.toLocaleString("en-US", { month: "long" });
    const currentYear = now.getFullYear();
    const monthPrefix = currentMonth.substring(0, 3).toLowerCase();
    const isCurrentMonthPaid =
      Number(rentYear) === currentYear &&
      String(rentMonth).toLowerCase().startsWith(monthPrefix);

    // Dispatch instant digital receipt to tenant on WhatsApp
    try {
      await sendRentReceiptWhatsApp({
        tenant: decryptTenantFields(tenant),
        receiptNumber,
        amountPaid,
        paymentMode,
        rentMonth,
        rentYear,
        remainingBalance: tenant.pendingBalance,
        organizationId,
      });
    } catch (whatsappErr: any) {
      console.warn("Could not dispatch WhatsApp receipt:", whatsappErr?.message);
    }

    return {
      ...(rentRecord.toObject ? rentRecord.toObject() : rentRecord),
      receiptNumber,
      receiptText,
      remainingBalance: tenant.pendingBalance,
      paymentPattern: tenant.paymentPattern,
      isCurrentMonthPaid,
      lastPaidMonth: tenant.lastPaidMonth,
      lastPaidYear: tenant.lastPaidYear,
    };
  });
};

export const getRentHistoryForTenantService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const tenant = await findTenantByIdRepo(
    req.params.id as string,
    organizationId,
  );
  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }
  const records = await findRentHistoryByTenantRepo(req.params.id as string);
  return records;
};


export const getTenantKycLinkService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const tenant = await findTenantByIdRepo(
    req.params.id as string,
    organizationId,
  );
  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  // If already verified
  if (tenant.kycStatus === "VERIFIED") {
    return {
      kycStatus: "VERIFIED",
      message: "Tenant is already verified",
      verifiedAt: tenant.kycVerifiedAt,
    };
  }

  // If token is missing or expired, generate a new one
  const isExpired =
    !tenant.kycToken ||
    !tenant.kycTokenExpires ||
    new Date(tenant.kycTokenExpires) < new Date();

  if (isExpired) {
    const { token, expiresAt } = generateKycTokenData();
    tenant.kycToken = token;
    tenant.kycTokenExpires = expiresAt;
    tenant.kycStatus = "PENDING";
    await tenant.save();
  }

  const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const kycLink = `${frontendBaseUrl}/kyc/${tenant.kycToken}`;

  return {
    kycStatus: tenant.kycStatus,
    kycLink,
    tenantName: tenant.name,
    contactNumber: tenant.contactNumber,
  };
};
