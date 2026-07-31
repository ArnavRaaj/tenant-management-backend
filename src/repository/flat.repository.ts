const Flat = require("../models/Flat");
const Tenant = require("../models/Tenant");
const RentHistory = require("../models/RentHistory");

export const getFlatListRepo = async (filter: any) => {
  return await Flat.find(filter)
    .populate({
      path: "currentTenant",
      select: "name monthlyRent pendingBalance",
    })
    .populate("address");
};

export const getFlatRepo = async (id: string) => {
  return await Flat.findById(id)
    .populate("currentTenant")
    .populate("address");
};

export const findOneFlatByNumberAndBuildingRepo = async (
  flatNumber: string,
  buildingName: string,
) => {
  return await Flat.findOne({ flatNumber, buildingName });
};

export const createFlatRepo = async (
  flatNumber: string,
  floor: number,
  buildingName: string,
  address?: string,
) => {
  const flat = await Flat.create({
    flatNumber,
    floor,
    buildingName,
    address: address || null,
  });
  return await flat.populate("address");
};

export const getDistinctBuildingNamesRepo = async () => {
  return await Flat.distinct("buildingName");
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
