import { Request } from "express";
import {
  getFlatRepo,
  createFlatRepo,
  deleteFlatRepo,
  getFlatListRepo,
  getTenantsByFlatIdRepo,
  findOneFlatByNumberRepo,
  getTenantsByFlatIdAscRepo,
  getRentHistoryByFlatIdRepo,
} from "../repository/flat.repository";
import { AppError } from "../utils/AppError";

export const getFlatListService = async (req: Request) => {
  const filter: any = {};
  if (req.query.status === "vacant") filter.currentTenant = null;
  if (req.query.status === "occupied") filter.currentTenant = { $ne: null };

  const flats = await getFlatListRepo(filter);
  return flats;
};

export const getFlatService = async (req: Request) => {
  const flat = await getFlatRepo(req.params.id as string);

  if (!flat) {
    throw new AppError("Flat not found", 404);
  }

  return flat;
};

export const createFlatService = async (req: Request) => {
  const { flatNumber, floor } = req.body;

  const flatExists = await findOneFlatByNumberRepo(flatNumber);
  if (flatExists) {
    throw new AppError("Flat already exists", 400);
  }

  const flat = await createFlatRepo(flatNumber, floor);
  return flat;
};

export const deleteFlatService = async (req: Request) => {
  const flat = await getFlatRepo(req.params.id as string);

  if (!flat) {
    throw new AppError("Flat not found", 404);
  }

  if (flat.currentTenant) {
    throw new AppError(
      "Cannot delete an occupied flat. Vacate the tenant first.",
      400
    );
  }

  await deleteFlatRepo(flat);
  return { message: "Flat deleted successfully" };
};

export const getFlatTenantHistoryService = async (req: Request) => {
  const flat = await getFlatRepo(req.params.id as string);
  if (!flat) {
    throw new AppError("Flat not found", 404);
  }

  const tenants = await getTenantsByFlatIdRepo(req.params.id as string);
  return tenants;
};

export const getFlatRevenueService = async (req: Request) => {
  const flat = await getFlatRepo(req.params.id as string);
  if (!flat) {
    throw new AppError("Flat not found", 404);
  }

  const monthlyBreakdown = await getRentHistoryByFlatIdRepo(
    req.params.id as string
  );

  const grandTotal = monthlyBreakdown.reduce(
    (sum: number, m: any) => sum + m.totalPaid,
    0
  );

  const formatted = monthlyBreakdown.map((m: any) => ({
    monthStr: `${m._id.month} ${m._id.year}`,
    month: m._id.month,
    year: m._id.year,
    totalPaid: m.totalPaid,
  }));

  return { grandTotal, monthlyBreakdown: formatted };
};

export const getFlatVacantHistoryService = async (req: Request) => {
  const flat = await getFlatRepo(req.params.id as string);
  if (!flat) {
    throw new AppError("Flat not found", 404);
  }

  const tenants = await getTenantsByFlatIdAscRepo(req.params.id as string);
  const vacancyPeriods = [];

  for (let i = 0; i < tenants.length - 1; i++) {
    const current = tenants[i];
    const next = tenants[i + 1];

    const vacatedAt = current.vacatedDate;
    const nextMovedIn = next.dateOfRenting;

    if (vacatedAt && nextMovedIn && vacatedAt < nextMovedIn) {
      vacancyPeriods.push({
        from: vacatedAt,
        to: nextMovedIn,
        prevTenant: current.name,
        nextTenant: next.name,
        daysVacant: Math.ceil(
          (new Date(nextMovedIn).getTime() - new Date(vacatedAt).getTime()) /
          (1000 * 60 * 60 * 24)
        ),
      });
    }
  }

  const lastTenant = tenants[tenants.length - 1];
  if (lastTenant && !flat.currentTenant && lastTenant.vacatedDate) {
    vacancyPeriods.push({
      from: lastTenant.vacatedDate,
      to: null, // Currently vacant
      prevTenant: lastTenant.name,
      nextTenant: null,
      daysVacant: Math.ceil(
        (new Date().getTime() - new Date(lastTenant.vacatedDate).getTime()) /
        (1000 * 60 * 60 * 24)
      ),
    });
  }

  return vacancyPeriods;
};
