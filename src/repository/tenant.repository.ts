const Tenant = require("../models/Tenant");
const RentHistory = require("../models/RentHistory");

export const findTenantsRepo = async (filter: any) => {
  return await Tenant.find(filter)
    .populate("flat", "flatNumber floor")
    .populate("address");
};

export const findTenantByIdRepo = async (id: string) => {
  return await Tenant.findById(id)
    .populate("flat", "flatNumber floor")
    .populate("address");
};

export const createTenantRepo = async (data: any, session?: any) => {
  if (session) {
    const tenants = await Tenant.create([data], { session });
    return tenants[0];
  }
  return await Tenant.create(data);
};

export const updateTenantRepo = async (id: string, data: any) => {
  return await Tenant.findByIdAndUpdate(id, data, {
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
