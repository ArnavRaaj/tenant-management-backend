import { toObjectId } from "../../core/db/objectId";
import { pageMeta, toSkip, type PageQuery } from "../../core/db/pagination";
import {
  ConflictError,
  ErrorCode,
  NotFoundError,
  UnprocessableError,
} from "../../core/errors/AppError";
import { recordAuditChange } from "../../core/requestContext";
import { decryptOrNull } from "../../core/security/crypto";
import { toRupees } from "../../core/utils/money";
import {
  monthName,
  periodLabel,
  periodMonth,
  periodYear,
} from "../../core/utils/period";
import { findAddressInOrg } from "../addresses/address.repository";
import type { AddressDoc } from "../addresses/address.model";
import { toTenantDto, type TenantRecord } from "../tenants/tenant.mapper";
import { rentRepository, tenantRepository } from "../tenants/tenant.repository";
import type { AuthContext } from "../../types/express";
import { Flat, type FlatDoc } from "./flat.model";
import { flatRepository } from "./flat.repository";

type PopulatedFlat = Omit<FlatDoc, "currentTenant" | "address"> & {
  currentTenant: TenantRecord | null;
  address: AddressDoc | null;
};

const flatDto = (flat: PopulatedFlat, includeDocumentUrl = false) => ({
  _id: flat._id.toHexString(),
  flatNumber: flat.flatNumber,
  floor: flat.floor,
  buildingName: flat.buildingName,
  address: flat.address,
  currentTenant: flat.currentTenant
    ? toTenantDto(
        { ...flat.currentTenant, flat: flat._id },
        { includeDocumentUrl },
      )
    : null,
  createdAt: flat.createdAt,
  updatedAt: flat.updatedAt,
});

export const listFlats = async (
  auth: AuthContext,
  query: PageQuery & { status?: "vacant" | "occupied"; buildingName?: string },
) => {
  const filter: Record<string, unknown> = {
    organizationId: toObjectId(auth.organizationId),
  };
  if (query.status === "vacant") filter.currentTenant = null;
  if (query.status === "occupied") filter.currentTenant = { $ne: null };
  if (query.buildingName) filter.buildingName = query.buildingName;

  const [items, total] = await Promise.all([
    Flat.find(filter)
      .sort({ floor: 1, flatNumber: 1 })
      .skip(toSkip(query))
      .limit(query.limit)
      .populate("currentTenant")
      .populate("address")
      .lean<PopulatedFlat[]>(),
    Flat.countDocuments(filter),
  ]);
  return { items: items.map((f) => flatDto(f)), meta: pageMeta(query, total) };
};

export const getFlat = async (auth: AuthContext, id: string) => {
  const flat = await Flat.findOne({
    _id: toObjectId(id),
    organizationId: toObjectId(auth.organizationId),
  })
    .populate("currentTenant")
    .populate("address")
    .lean<PopulatedFlat>();
  if (!flat) throw new NotFoundError("Flat not found");
  return flatDto(flat, true);
};

export const createFlat = async (
  auth: AuthContext,
  input: {
    flatNumber: string;
    floor: number;
    buildingName: string;
    address?: string;
  },
) => {
  if (
    input.address &&
    !(await findAddressInOrg(input.address, auth.organizationId))
  ) {
    throw new UnprocessableError("Address not found in your organisation");
  }
  const org = toObjectId(auth.organizationId);
  if (
    await Flat.exists({
      organizationId: org,
      buildingName: input.buildingName,
      flatNumber: input.flatNumber,
    })
  ) {
    throw new ConflictError(
      `Flat ${input.flatNumber} already exists in ${input.buildingName}`,
      ErrorCode.DUPLICATE_RESOURCE,
    );
  }
  const flat = await Flat.create({
    flatNumber: input.flatNumber,
    floor: input.floor,
    buildingName: input.buildingName,
    address: input.address ? toObjectId(input.address) : null,
    organizationId: org,
  });
  const populated = await flat.populate<{ address: AddressDoc | null }>(
    "address",
  );
  const obj = populated.toObject() as unknown as PopulatedFlat;
  recordAuditChange({
    resourceId: flat._id.toHexString(),
    after: {
      flatNumber: flat.flatNumber,
      floor: flat.floor,
      buildingName: flat.buildingName,
    },
  });
  return flatDto({ ...obj, currentTenant: null });
};

export const deleteFlat = async (
  auth: AuthContext,
  id: string,
): Promise<void> => {
  const flat = await flatRepository.findById(id, auth.organizationId);
  if (!flat) throw new NotFoundError("Flat not found");
  if (flat.currentTenant) {
    throw new ConflictError(
      "Cannot delete an occupied flat. Vacate the tenant first.",
    );
  }
  // Atomic: fails if a tenant was assigned between the check and the delete.
  if (!(await flatRepository.deleteIfVacant(id, auth.organizationId))) {
    throw new ConflictError("Flat became occupied; it cannot be deleted");
  }
  recordAuditChange({
    resourceId: id,
    before: {
      flatNumber: flat.flatNumber,
      floor: flat.floor,
      buildingName: flat.buildingName,
    },
    after: null,
  });
};

export const listBuildingNames = async (auth: AuthContext): Promise<string[]> =>
  (await flatRepository.distinctBuildings(auth.organizationId)).sort();

const ensureFlat = async (auth: AuthContext, id: string) => {
  const flat = await flatRepository.findById(id, auth.organizationId);
  if (!flat) throw new NotFoundError("Flat not found");
  return flat;
};

export const flatTenantHistory = async (auth: AuthContext, id: string) => {
  await ensureFlat(auth, id);
  const tenants = await tenantRepository.listForFlat(
    id,
    auth.organizationId,
    -1,
  );
  return tenants.map((t) => ({
    _id: t._id.toHexString(),
    name: t.name,
    contactNumber: decryptOrNull(t.contactNumber),
    dateOfRenting: t.dateOfRenting,
    vacatedDate: t.vacatedDate,
    isActive: t.isActive,
    monthlyRent: toRupees(t.monthlyRent),
    securityDeposit: toRupees(t.securityDeposit),
    pendingBalance: toRupees(t.pendingBalance),
  }));
};

export const flatRevenue = async (auth: AuthContext, id: string) => {
  await ensureFlat(auth, id);
  const rows = await rentRepository.revenueByPeriodForFlat(
    id,
    auth.organizationId,
  );
  const grandTotal = rows.reduce((sum, r) => sum + r.totalPaid, 0);
  return {
    grandTotal: toRupees(grandTotal),
    monthlyBreakdown: rows.map((r) => ({
      monthStr: periodLabel(r._id),
      month: monthName(periodMonth(r._id)),
      year: periodYear(r._id),
      totalPaid: toRupees(r.totalPaid),
    })),
  };
};

const DAY_MS = 86_400_000;

export const flatVacancyHistory = async (auth: AuthContext, id: string) => {
  const flat = await ensureFlat(auth, id);
  const tenants = await tenantRepository.listForFlat(
    id,
    auth.organizationId,
    1,
  );
  const periods: {
    from: Date;
    to: Date | null;
    prevTenant: string;
    nextTenant: string | null;
    daysVacant: number;
  }[] = [];

  tenants.forEach((current, i) => {
    const next = tenants[i + 1];
    if (
      next &&
      current.vacatedDate &&
      current.vacatedDate < next.dateOfRenting
    ) {
      periods.push({
        from: current.vacatedDate,
        to: next.dateOfRenting,
        prevTenant: current.name,
        nextTenant: next.name,
        daysVacant: Math.ceil(
          (next.dateOfRenting.getTime() - current.vacatedDate.getTime()) /
            DAY_MS,
        ),
      });
    }
  });

  const last = tenants[tenants.length - 1];
  if (last && !flat.currentTenant && last.vacatedDate) {
    periods.push({
      from: last.vacatedDate,
      to: null,
      prevTenant: last.name,
      nextTenant: null,
      daysVacant: Math.ceil((Date.now() - last.vacatedDate.getTime()) / DAY_MS),
    });
  }
  return periods;
};
