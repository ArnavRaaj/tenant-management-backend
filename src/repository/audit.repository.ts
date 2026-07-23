const AuditLog = require("../models/AuditLog");

export const createAuditLogRepo = async (data: {
  username: string;
  action: string;
  timestamp: string;
}) => {
  return await AuditLog.create(data);
};
