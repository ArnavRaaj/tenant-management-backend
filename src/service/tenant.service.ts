import { Request } from "express";
import {
  findTenantsRepo,
  createTenantRepo,
  updateTenantRepo,
  findTenantByIdRepo,
  createRentHistoryRepo,
  findRentHistoryByTenantRepo,
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

  const tenants = await findTenantsRepo(filter);
  return tenants.map(decryptTenantFields);
};

export const getTenantService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const tenant = await findTenantByIdRepo(
    req.params.id as string,
    organizationId,
  );

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  return decryptTenantFields(tenant);
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

    return decryptTenantFields(tenant);
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

    const { amountPaid, rentMonth, rentYear, paymentDate } = req.body;

    const rentRecord = await createRentHistoryRepo(
      {
        tenant: tenant._id,
        flat: tenant.flat?._id || tenant.flat,
        amountPaid,
        paymentDate: paymentDate || Date.now(),
        rentMonth,
        rentYear,
        organizationId,
      },
      session,
    );

    const difference = tenant.monthlyRent - amountPaid;
    tenant.pendingBalance += difference;
    if (session) {
      await tenant.save({ session });
    } else {
      await tenant.save();
    }

    return rentRecord;
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
