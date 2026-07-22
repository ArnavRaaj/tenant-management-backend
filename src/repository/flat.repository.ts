const Flat = require("../models/Flat");
const Tenant = require("../models/Tenant");
const RentHistory = require("../models/RentHistory");

export const getFlatListRepo = async (filter: any) => {
  return await Flat.find(filter).populate("currentTenant");
};

export const getFlatRepo = async (id: string) => {
  return await Flat.findById(id).populate("currentTenant");
};

export const findOneFlatByNumberRepo = async (flatNumber: string) => {
  return await Flat.findOne({ flatNumber });
};

export const createFlatRepo = async (flatNumber: string, floor: number) => {
  return await Flat.create({ flatNumber, floor });
};

export const deleteFlatRepo = async (flat: any) => {
  return await flat.deleteOne();
};

export const getTenantsByFlatIdRepo = async (flatId: string) => {
  return await Tenant.find({ flat: flatId })
    .sort({ dateOfRenting: -1 })
    .select(
      "name contactNumber dateOfRenting vacatedDate isActive monthlyRent securityDeposit pendingBalance",
    );
};

export const getRentHistoryByFlatIdRepo = async (flatId: string) => {
  const mongoose = require("mongoose");
  return await RentHistory.aggregate([
    { $match: { flat: new mongoose.Types.ObjectId(flatId) } },
    {
      $group: {
        _id: { month: "$rentMonth", year: "$rentYear" },
        totalPaid: { $sum: "$amountPaid" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
};

export const getTenantsByFlatIdAscRepo = async (flatId: string) => {
  return await Tenant.find({ flat: flatId })
    .sort({ dateOfRenting: 1 })
    .select("name dateOfRenting vacatedDate isActive");
};
