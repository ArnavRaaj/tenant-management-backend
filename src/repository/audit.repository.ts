import AuditLog from "../models/AuditLog";

export const createAuditLogRepo = async (data: any) => {
  return await AuditLog.create(data);
};

export const getAuditLogsRepo = async (
  filter: any,
  limit = 50,
  page = 1,
) => {
  const skip = (page - 1) * limit;
  return await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};
