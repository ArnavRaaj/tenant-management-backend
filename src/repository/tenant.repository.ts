const Tenant = require("../models/Tenant");
const RentHistory = require("../models/RentHistory");

export const findTenantsRepo = async (filter: any) => {
  return await Tenant.find(filter).populate("flat", "flatNumber floor");
};

export const findTenantByIdRepo = async (
  id: string,
  organizationId: string,
) => {
  return await Tenant.findOne({ _id: id, organizationId }).populate(
    "flat",
    "flatNumber floor",
  );
};

export const createTenantRepo = async (data: any, session?: any) => {
  if (session) {
    const tenants = await Tenant.create([data], { session });
    return tenants[0];
  }
  return await Tenant.create(data);
};

export const updateTenantRepo = async (
  id: string,
  data: any,
  organizationId: string,
) => {
  return await Tenant.findOneAndUpdate({ _id: id, organizationId }, data, {
    new: true,
    runValidators: true,
  });
};

export const createRentHistoryRepo = async (data: any) => {
  return await RentHistory.create(data);
};

export const findRentHistoryByTenantRepo = async (tenantId: string) => {
  return await RentHistory.find({ tenant: tenantId }).sort({ paymentDate: -1 });
};
