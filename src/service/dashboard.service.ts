import { Request } from "express";
import {
  aggregateMonthlyRentRepo,
  aggregateFloorRentRepo,
} from "../repository/dashboard.repository";

export const getDashboardStatsService = async (req: Request) => {
  const monthlyRent = await aggregateMonthlyRentRepo();

  const currentMonthName = new Date().toLocaleString("default", {
    month: "long",
  });
  const currentYearNum = new Date().getFullYear();

  const filterMonth = req.query.month || currentMonthName;
  const filterYear = req.query.year
    ? parseInt(req.query.year as string)
    : currentYearNum;

  const floorRent = await aggregateFloorRentRepo(
    filterMonth as string,
    filterYear as number,
  );

  const floorMapping: { [key: number]: string } = {
    0: "Ground Floor",
    1: "First Floor",
    2: "Second Floor",
  };

  const formattedFloorRent = floorRent.map((f: any) => ({
    floorStr: floorMapping[f._id],
    floorNum: f._id,
    totalRent: f.totalRent,
  }));

  const formattedMonthlyRent = monthlyRent.map((m: any) => ({
    monthStr: `${m._id.month} ${m._id.year}`,
    totalRent: m.totalRent,
  }));

  return {
    monthlyRentBreakdown: formattedMonthlyRent,
    floorRentBreakdown: formattedFloorRent,
  };
};
