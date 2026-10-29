const MaintenanceTicket = require("../models/MaintenanceTicket");

export const createMaintenanceTicketRepo = async (data: any, session?: any) => {
  if (session) {
    const tickets = await MaintenanceTicket.create([data], { session });
    return tickets[0];
  }
  return await MaintenanceTicket.create(data);
};

export const findMaintenanceTicketsRepo = async (
  filter: any,
  sort: any = { createdAt: -1 },
  skip: number = 0,
  limit: number = 50,
) => {
  return await MaintenanceTicket.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate("tenant", "name contactNumber kycStatus")
    .populate("flat", "flatNumber floor buildingName");
};

export const countMaintenanceTicketsRepo = async (filter: any) => {
  return await MaintenanceTicket.countDocuments(filter);
};

export const findMaintenanceTicketByIdRepo = async (
  id: string,
  organizationId: string,
) => {
  return await MaintenanceTicket.findOne({ _id: id, organizationId })
    .populate("tenant", "name contactNumber kycStatus")
    .populate("flat", "flatNumber floor buildingName");
};

export const updateMaintenanceTicketRepo = async (
  id: string,
  organizationId: string,
  updateData: any,
) => {
  return await MaintenanceTicket.findOneAndUpdate(
    { _id: id, organizationId },
    updateData,
    { new: true, runValidators: true },
  )
    .populate("tenant", "name contactNumber kycStatus")
    .populate("flat", "flatNumber floor buildingName");
};

export const aggregateMaintenanceStatsRepo = async (organizationId: any) => {
  const stats = await MaintenanceTicket.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const categoryStats = await MaintenanceTicket.aggregate([
    { $match: { organizationId, status: { $ne: "CLOSED" } } },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ]);

  return { statusStats: stats, categoryStats };
};

