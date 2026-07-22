import { Request, Response } from "express";
import {
  getFlatRepo,
  getFlatListRepo,
  findOneFlatByNumberRepo,
  createFlatRepo,
  deleteFlatRepo,
  getTenantsByFlatIdRepo,
  getRentHistoryByFlatIdRepo,
  getTenantsByFlatIdAscRepo,
} from "../repository/flat.repository";

export const getFlatListService = async (req: Request, res: Response) => {
  const filter: any = {};
  if (req.query.status === "vacant") filter.currentTenant = null;
  if (req.query.status === "occupied") filter.currentTenant = { $ne: null };

  const flats = await getFlatListRepo(filter);
  res.status(200).json(flats);
};

export const getFlatService = async (req: Request, res: Response) => {
  const flat = await getFlatRepo(req.params.id as string);

  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
  }

  res.status(200).json(flat);
};

export const createFlatService = async (req: Request, res: Response) => {
  const { flatNumber, floor } = req.body;

  const flatExists = await findOneFlatByNumberRepo(flatNumber);
  if (flatExists) {
    res.status(400).json({ message: "Flat already exists" });
    return;
  }

  const flat = await createFlatRepo(flatNumber, floor);
  res.status(201).json(flat);
};

export const deleteFlatService = async (req: Request, res: Response) => {
  const flat = await getFlatRepo(req.params.id as string);

  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
  }

  if (flat.currentTenant) {
    res.status(400).json({
      message: "Cannot delete an occupied flat. Vacate the tenant first.",
    });
    return;
  }

  await deleteFlatRepo(flat);
  res.status(200).json({ message: "Flat deleted successfully" });
};

export const getFlatTenantHistoryService = async (
  req: Request,
  res: Response,
) => {
  const flat = await getFlatRepo(req.params.id as string);
  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
  }

  const tenants = await getTenantsByFlatIdRepo(req.params.id as string);
  res.status(200).json(tenants);
};

export const getFlatRevenueService = async (req: Request, res: Response) => {
  const flat = await getFlatRepo(req.params.id as string);
  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
  }

  const monthlyBreakdown = await getRentHistoryByFlatIdRepo(
    req.params.id as string,
  );

  const grandTotal = monthlyBreakdown.reduce(
    (sum: number, m: any) => sum + m.totalPaid,
    0,
  );

  const formatted = monthlyBreakdown.map((m: any) => ({
    monthStr: `${m._id.month} ${m._id.year}`,
    month: m._id.month,
    year: m._id.year,
    totalPaid: m.totalPaid,
  }));

  res.status(200).json({ grandTotal, monthlyBreakdown: formatted });
};

export const getFlatVacantHistoryService = async (
  req: Request,
  res: Response,
) => {
  const flat = await getFlatRepo(req.params.id as string);
  if (!flat) {
    res.status(404).json({ message: "Flat not found" });
    return;
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
            (1000 * 60 * 60 * 24),
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
          (1000 * 60 * 60 * 24),
      ),
    });
  }

  res.status(200).json(vacancyPeriods);
};
