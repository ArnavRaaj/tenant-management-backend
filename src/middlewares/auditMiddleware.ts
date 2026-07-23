import { Request, Response, NextFunction } from "express";
import { createAuditLogRepo } from "../repository/audit.repository";

export const auditLog = (req: any, res: Response, next: NextFunction) => {
  if (req.user) {
    const username = req.user.name || req.user.email;
    const action = `${req.method} ${req.originalUrl}`;

    const now = new Date();
    const timestamp = now.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    createAuditLogRepo({
      username,
      action,
      timestamp,
    }).catch((err: any) => {
      console.error("Failed to write audit log:", err);
    });
  }

  next();
};
