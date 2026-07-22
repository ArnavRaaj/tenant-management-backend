const RentHistory = require("../models/RentHistory");

export const aggregateMonthlyRentRepo = async () => {
  return await RentHistory.aggregate([
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
) => {
  return await RentHistory.aggregate([
    {
      $match: {
        rentMonth: filterMonth,
        rentYear: filterYear,
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
