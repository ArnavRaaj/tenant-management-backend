import mongoose from "mongoose";
const RentHistory = require("../models/RentHistory");

export const aggregateMonthlyRentRepo = async (organizationId: string) => {
  return await RentHistory.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(organizationId) } },
    {
      $group: {
        _id: { month: "$rentMonth", year: "$rentYear" },
        totalRent: { $sum: "$amountPaid" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
};

export const aggregateFloorRentRepo = async (
  filterMonth: string,
  filterYear: number,
  organizationId: string,
) => {
  return await RentHistory.aggregate([
    {
      $match: {
        rentMonth: filterMonth,
        rentYear: filterYear,
        organizationId: new mongoose.Types.ObjectId(organizationId),
      },
    },
    {
      $lookup: {
        from: "flats",
        localField: "flat",
        foreignField: "_id",
        as: "flatDetails",
      },
    },
    { $unwind: "$flatDetails" },
    {
      $group: {
        _id: "$flatDetails.floor",
        totalRent: { $sum: "$amountPaid" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};
