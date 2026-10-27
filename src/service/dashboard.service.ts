import { Request } from "express";
import {
  aggregateMonthlyRentRepo,
  aggregateFloorRentRepo,
} from "../repository/dashboard.repository";
import { getFloorsService } from "./floor.service";

export const getDashboardStatsService = async (req: Request) => {
  const organizationId = (req as any).organizationId;
  const monthlyRent = await aggregateMonthlyRentRepo(organizationId);

  const currentMonthName = new Date().toLocaleString("default", {
    month: "long",
  });
  const currentYearNum = new Date().getFullYear();

  const filterMonth = req.query.month || currentMonthName;
  const filterYear = req.query.year
    ? parseInt(req.query.year as string)
    : currentYearNum;

  const [floorRent, dbFloors] = await Promise.all([
    aggregateFloorRentRepo(
      filterMonth as string,
      filterYear as number,
      organizationId,
    ),
    getFloorsService(),
  ]);

  // Dynamic floor mapping driven 100% by the database Floor collection
  const floorNameMap = new Map<number, string>();
  dbFloors.forEach((f: any) => {
    floorNameMap.set(f.floorNumber, f.name);
  });

  const formattedFloorRent = floorRent.map((f: any) => ({
    floorStr:
      floorNameMap.get(f._id) ||
      (f._id === 0 ? "Ground Floor" : `Floor ${f._id}`),
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
