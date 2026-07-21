import { Request, Response } from "express";
const Tenant = require("../models/Tenant");
const Flat = require("../models/Flat");
const RentHistory = require("../models/RentHistory");
const { asyncHandler } = require("../utils/helpers");
const { uploadImage } = require("../utils/cloudinary");

// @desc    Get all active tenants
// @route   GET /api/tenants
exports.getTenants = asyncHandler(async (req: Request, res: Response) => {
  const filter: any = {};

  // ?status=past  → inactive tenants; default → active only
  if (req.query.status === "past") filter.isActive = false;
  else filter.isActive = true;

  // ?rentDue=true → only tenants with a pending balance (only meaningful for active)
  if (req.query.rentDue === "true") filter.pendingBalance = { $gt: 0 };

  const tenants = await Tenant.find(filter).populate(
    "flat",
    "flatNumber floor",
  );
  res.status(200).json(tenants);
});

// @desc    Get single tenant
// @route   GET /api/tenants/:id
exports.getTenant = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await Tenant.findById(req.params.id).populate(
    "flat",
    "flatNumber floor",
  );

  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  res.status(200).json(tenant);
});

// @desc    Assign flat to new tenant
// @route   POST /api/tenants
exports.createTenant = asyncHandler(async (req: any, res: Response) => {
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

  // Validate flat
  const flat = await Flat.findById(flatId);
  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
  }

  // Check if flat is already occupied
  if (flat.currentTenant) {
    res.status(400).json({ message: "Flat is already occupied" });
    return;
  }

  let imageUrl = "";
  // Handle Aadhar image upload to Cloudinary if a file was provided
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

  const tenant = await Tenant.create({
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

  // Update flat with new tenant
  flat.currentTenant = tenant._id;
  await flat.save();

  res.status(201).json(tenant);
});

// @desc    Update tenant details
// @route   PUT /api/tenants/:id
exports.updateTenant = asyncHandler(async (req: any, res: Response) => {
  let tenant = await Tenant.findById(req.params.id);

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

  tenant = await Tenant.findByIdAndUpdate(
    req.params.id,
    { ...req.body, aadharImage: imageUrl },
    { new: true, runValidators: true },
  );

  res.status(200).json(tenant);
});

// @desc    Change tenant (Move out current, assign new)
// @route   POST /api/tenants/:id/change
exports.changeTenant = asyncHandler(async (req: Request, res: Response) => {
  const currentTenant = await Tenant.findById(req.params.id);

  if (!currentTenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  const flatId = currentTenant.flat;
  const flat = await Flat.findById(flatId);

  // Mark current tenant as inactive and record vacated date
  currentTenant.isActive = false;
  currentTenant.vacatedDate = Date.now();
  await currentTenant.save();

  // Clear flat's current tenant reference temporarily to reuse createTenant logic
  flat.currentTenant = null;
  await flat.save();

  // Redirect logic to createTenant internally by passing flatId
  req.body.flatId = flatId;
  exports.createTenant(req, res);
});

// @desc    Add a rent payment record
// @route   POST /api/tenants/:id/rent
exports.addRentRecord = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await Tenant.findById(req.params.id);

  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  const { amountPaid, rentMonth, rentYear, paymentDate } = req.body;

  const rentRecord = await RentHistory.create({
    tenant: tenant._id,
    flat: tenant.flat,
    amountPaid,
    paymentDate: paymentDate || Date.now(),
    rentMonth,
    rentYear,
  });

  // Calculate pending balance if amountPaid < monthlyRent
  // Assuming a simple logic here: they owe monthlyRent for that month
  const difference = tenant.monthlyRent - amountPaid;
  tenant.pendingBalance += difference;
  await tenant.save();

  res.status(201).json(rentRecord);
});

// @desc    Get rent history for a tenant
// @route   GET /api/tenants/:id/rent
exports.getRentHistoryForTenant = asyncHandler(
  async (req: Request, res: Response) => {
    const records = await RentHistory.find({ tenant: req.params.id }).sort({
      paymentDate: -1,
    });
    res.status(200).json(records);
  },
);
