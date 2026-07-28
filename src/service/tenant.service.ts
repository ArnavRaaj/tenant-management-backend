import { Request } from "express";
import mongoose from "mongoose";
import {
  findTenantsRepo,
  createTenantRepo,
  updateTenantRepo,
  findTenantByIdRepo,
  createRentHistoryRepo,
  findRentHistoryByTenantRepo,
} from "../repository/tenant.repository";
import { getFlatRepo } from "../repository/flat.repository";
import { AppError } from "../utils/AppError";
import { encrypt, decrypt } from "../utils/encryption";
const { uploadImage } = require("../utils/cloudinary");

// Fields that require encryption
const ENCRYPTED_FIELDS = [
  "contactNumber",
  "aadharNumber",
  "gender",
  "aadharImage",
];

/**
 * Encrypts sensitive fields before saving to DB.
 */
const encryptTenantFields = (data: any): any => {
  const encrypted = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  }
  return encrypted;
};

/**
 * Decrypts sensitive fields after reading from DB.
 * Works on a single tenant document (Mongoose doc or plain object).
 */
const decryptTenantFields = (tenant: any): any => {
  if (!tenant) return tenant;
  const obj = tenant.toObject ? tenant.toObject() : { ...tenant };
  for (const field of ENCRYPTED_FIELDS) {
    if (obj[field]) {
      obj[field] = decrypt(obj[field]);
    }
  }
  return obj;
};

export const getTenantsService = async (req: Request) => {
  const filter: any = {};
  if (req.query.status === "past") filter.isActive = false;
  else filter.isActive = true;

  if (req.query.rentDue === "true") filter.pendingBalance = { $gt: 0 };

  const tenants = await findTenantsRepo(filter);
  return tenants.map(decryptTenantFields);
};

export const getTenantService = async (req: Request) => {
  const tenant = await findTenantByIdRepo(req.params.id as string);

  if (!tenant) {
    throw new AppError("Tenant not found", 404);
  }

  return decryptTenantFields(tenant);
};

export const createTenantService = async (req: any) => {
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

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const flat = await getFlatRepo(flatId);
    if (!flat) {
      throw new AppError("Flat not found", 404);
    }

    if (flat.currentTenant) {
      throw new AppError("Flat is already occupied", 400);
    }

    const tenantData = encryptTenantFields({
      name,
      contactNumber,
      age,
      aadharNumber,
      gender,
      aadharImage: "",
      address: address || null,
      occupantsCount,
      securityDeposit,
      monthlyRent,
      pendingBalance: pendingBalance || 0,
      flat: flatId,
      isActive: true,
      dateOfRenting: dateOfRenting || Date.now(),
    });

    const tenant = await createTenantRepo(tenantData, session);

    flat.currentTenant = tenant._id;
    await flat.save({ session });

    if (req.file) {
      const folderPath = `tenant-management/aadhar/${flat.flatNumber}/${tenant._id}`;
      const result: any = await uploadImage(req.file.buffer, folderPath);
      tenant.aadharImage = encrypt(result.secure_url);
      await tenant.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    return decryptTenantFields(tenant);
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    console.error("Tenant creation failed", error);
    if (error instanceof AppError) throw error;
    throw new AppError(error.message || "Tenant creation failed", 500);
  }
};

export const updateTenantService = async (req: any) => {
  let tenant = await findTenantByIdRepo(req.params.id as string);
  if (!tenant) {
    throw new AppError("Tenant not found", 404);
  }

  let imageUrl = tenant.aadharImage;
  if (req.file) {
    try {
      const decryptedFlat = tenant.flat;
      const folderPath = `tenant-management/aadhar/${decryptedFlat.flatNumber}/${tenant._id}`;
      const result: any = await uploadImage(req.file.buffer, folderPath);
      imageUrl = encrypt(result.secure_url);
    } catch (error) {
      console.error("Image upload failed", error);
      throw new AppError("Image upload failed", 500);
    }
  }

  // Encrypt sensitive fields from the request body
  const updateData = { ...req.body };
  for (const field of ENCRYPTED_FIELDS) {
    if (field === "aadharImage") continue; // handled separately above
    if (updateData[field]) {
      updateData[field] = encrypt(updateData[field]);
    }
  }
  updateData.aadharImage = imageUrl;

  tenant = await updateTenantRepo(req.params.id as string, updateData);
  return decryptTenantFields(tenant);
};

export const changeTenantService = async (req: Request) => {
  const currentTenant = await findTenantByIdRepo(req.params.id as string);
  if (!currentTenant) {
    throw new AppError("Tenant not found", 404);
  }

  const flatId = currentTenant.flat._id;
  const flat = await getFlatRepo(flatId);

  currentTenant.isActive = false;
  currentTenant.vacatedDate = Date.now();
  await currentTenant.save();

  flat.currentTenant = null;
  await flat.save();

  req.body.flatId = flatId;
  return await createTenantService(req);
};

export const addRentRecordService = async (req: Request) => {
  const tenant = await findTenantByIdRepo(req.params.id as string);
  if (!tenant) {
    throw new AppError("Tenant not found", 404);
  }

  const { amountPaid, rentMonth, rentYear, paymentDate } = req.body;

  const rentRecord = await createRentHistoryRepo({
    tenant: tenant._id,
    flat: tenant.flat._id,
    amountPaid,
    paymentDate: paymentDate || Date.now(),
    rentMonth,
    rentYear,
  });

  const difference = tenant.monthlyRent - amountPaid;
  tenant.pendingBalance += difference;
  await tenant.save();

  return rentRecord;
};

export const getRentHistoryForTenantService = async (req: Request) => {
  const records = await findRentHistoryByTenantRepo(req.params.id as string);
  return records;
};
