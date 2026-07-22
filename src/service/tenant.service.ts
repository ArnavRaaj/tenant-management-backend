import { Request, Response } from "express";
import {
  findTenantsRepo,
  createTenantRepo,
  updateTenantRepo,
  findTenantByIdRepo,
  createRentHistoryRepo,
  findRentHistoryByTenantRepo,
} from "../repository/tenant.repository";
import { getFlatRepo } from "../repository/flat.repository";
const { uploadImage } = require("../utils/cloudinary");

export const getTenantsService = async (req: Request, res: Response) => {
  const filter: any = {};
  if (req.query.status === "past") filter.isActive = false;
  else filter.isActive = true;

  if (req.query.rentDue === "true") filter.pendingBalance = { $gt: 0 };

  const tenants = await findTenantsRepo(filter);
  res.status(200).json(tenants);
};

export const getTenantService = async (req: Request, res: Response) => {
  const tenant = await findTenantByIdRepo(req.params.id as string);

  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  res.status(200).json(tenant);
};

export const createTenantService = async (req: any, res: Response) => {
  const {
    name,
    contactNumber,
    age,
    aadharNumber,
    address,
    occupantsCount,
    securityDeposit,
    monthlyRent,
    pendingBalance,
    flatId,
    dateOfRenting,
  } = req.body;

  const flat = await getFlatRepo(flatId);
  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
  }

  if (flat.currentTenant) {
    res.status(400).json({ message: "Flat is already occupied" });
    return;
  }

  let imageUrl = "";
  if (req.file) {
    try {
      const result = await uploadImage(req.file.buffer);
      imageUrl = result.secure_url;
    } catch (error) {
      console.error("Image upload failed", error);
      res.status(500).json({ message: "Image upload failed" });
      return;
    }
  }

  const tenant = await createTenantRepo({
    name,
    contactNumber,
    age,
    aadharNumber,
    aadharImage: imageUrl,
    address,
    occupantsCount,
    securityDeposit,
    monthlyRent,
    pendingBalance: pendingBalance || 0,
    flat: flatId,
    isActive: true,
    dateOfRenting: dateOfRenting || Date.now(),
  });

  flat.currentTenant = tenant._id;
  await flat.save();

  res.status(201).json(tenant);
};

export const updateTenantService = async (req: any, res: Response) => {
  let tenant = await findTenantByIdRepo(req.params.id as string);
  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  let imageUrl = tenant.aadharImage;
  if (req.file) {
    try {
      const result = await uploadImage(req.file.buffer);
      imageUrl = result.secure_url;
    } catch (error) {
      console.error("Image upload failed", error);
      res.status(500).json({ message: "Image upload failed" });
      return;
    }
  }

  tenant = await updateTenantRepo(req.params.id as string, {
    ...req.body,
    aadharImage: imageUrl,
  });
  res.status(200).json(tenant);
};

export const changeTenantService = async (req: Request, res: Response) => {
  const currentTenant = await findTenantByIdRepo(req.params.id as string);
  if (!currentTenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  // tenant.flat is populated, so it is an object
  const flatId = currentTenant.flat._id;
  const flat = await getFlatRepo(flatId);

  currentTenant.isActive = false;
  currentTenant.vacatedDate = Date.now();
  await currentTenant.save();

  flat.currentTenant = null;
  await flat.save();

  req.body.flatId = flatId;
  return await createTenantService(req, res);
};

export const addRentRecordService = async (req: Request, res: Response) => {
  const tenant = await findTenantByIdRepo(req.params.id as string);
  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
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

  res.status(201).json(rentRecord);
};

export const getRentHistoryForTenantService = async (
  req: Request,
  res: Response,
) => {
  const records = await findRentHistoryByTenantRepo(req.params.id as string);
  res.status(200).json(records);
};
