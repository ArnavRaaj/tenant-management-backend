const Tenant = require("../models/Tenant");
const RentHistory = require("../models/RentHistory");

export const findTenantsRepo = async (filter: any) => {
  return await Tenant.find(filter).populate("flat", "flatNumber floor").lean();
};

export const findTenantByIdRepo = async (
  id: string,
  organizationId: string,
  session?: any,
) => {
  let query = Tenant.findOne({ _id: id, organizationId });
  if (session) {
    query = query.session(session);
  }
  return await query.populate("flat", "flatNumber floor");
};

export const findTenantByKycTokenRepo = async (token: string) => {
  return await Tenant.findOne({
    kycToken: token,
  }).populate("flat", "flatNumber floor buildingName");
};

export const updateTenantDirectRepo = async (
  id: string,
  data: any,
  session?: any,
) => {
  return await Tenant.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
    session,
  });
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
  session?: any,
) => {
  return await Tenant.findOneAndUpdate({ _id: id, organizationId }, data, {
    new: true,
    runValidators: true,
    session,
  });
};

export const createRentHistoryRepo = async (data: any, session?: any) => {
  if (session) {
    const records = await RentHistory.create([data], { session });
    return records[0];
  }
  return await RentHistory.create(data);
};

export const findRentHistoryByTenantRepo = async (tenantId: string) => {
  return await RentHistory.find({ tenant: tenantId }).sort({ paymentDate: -1 }).lean();
};

export const findCurrentMonthRentHistoryRepo = async (
  organizationId: string,
  rentMonth: string,
  rentYear: number,
) => {
  const monthPrefix = rentMonth.substring(0, 3);
  return await RentHistory.find({
    organizationId,
    rentYear,
    rentMonth: { $regex: new RegExp(`^${monthPrefix}`, "i") },
  }).select("tenant amountPaid rentMonth rentYear").lean();
};
