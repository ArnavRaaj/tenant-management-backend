import { Response, NextFunction } from "express";
import { createAuditLogRepo } from "../repository/audit.repository";

/**
 * Derives a human-readable action name and resource category from HTTP method and path
 */
const determineAction = (
  method: string,
  path: string,
): { action: string; resource: string } => {
  const cleanPath = path.toLowerCase();
  let resource = "general";

  if (cleanPath.includes("/flats")) resource = "flats";
  else if (cleanPath.includes("/tenants")) resource = "tenants";
  else if (cleanPath.includes("/users")) resource = "users";
  else if (cleanPath.includes("/addresses")) resource = "addresses";
  else if (cleanPath.includes("/auth")) resource = "auth";
  else if (cleanPath.includes("/dashboard")) resource = "dashboard";

  let action = `${method}_${resource.toUpperCase()}`;
  if (cleanPath.includes("/vacate")) action = "VACATE_TENANT";
  else if (cleanPath.includes("/change")) action = "CHANGE_TENANT";
  else if (cleanPath.includes("/rent")) {
    action = method === "POST" ? "RECORD_RENT_PAYMENT" : "GET_RENT_HISTORY";
  } else if (cleanPath.includes("/invite")) action = "INVITE_ADMIN";
  else if (cleanPath.includes("/accept-invitation")) action = "ACCEPT_ADMIN_INVITATION";
  else if (cleanPath.includes("/login")) action = "LOGIN";
  else if (cleanPath.includes("/register")) action = "REGISTER";
  else if (cleanPath.includes("/reset-password")) action = "RESET_PASSWORD";
  else if (cleanPath.includes("/verify-email")) action = "VERIFY_EMAIL";

  return { action, resource };
};

/**
 * Redacts sensitive fields from audit logs (passwords, tokens, OTPs, etc.)
 */
const sanitizeMeta = (body: any): any => {
  if (!body || typeof body !== "object") return {};
  const sanitized = { ...body };
  const sensitiveKeys = [
    "password",
    "confirmpassword",
    "token",
    "otp",
    "secret",
    "aadharimage",
  ];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = "[REDACTED]";
    }
  }
  return sanitized;
};

/**
 * Non-blocking Audit Middleware:
 * Uses res.on('finish') to asynchronously record Who, When, What to MongoDB
 * without adding ANY latency to client responses.
 */
export const auditLog = (req: any, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on("finish", () => {
    // Only audit mutations (POST, PUT, DELETE, PATCH) or authenticated actions, or auth routes
    const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
    const isAuthRoute = req.originalUrl?.includes("/api/auth");
    const isAuthenticated = Boolean(req.user);

    if (!isMutation && !isAuthRoute && !isAuthenticated) {
      return;
    }

    const durationMs = Date.now() - startTime;
    const { action, resource } = determineAction(req.method, req.originalUrl || req.url);

    const logData = {
      // WHO
      userId: req.user?._id || null,
      username: req.user?.name || req.user?.email || "Anonymous",
      email: req.user?.email || "",
      role: req.user?.role || "guest",
      organizationId: req.organizationId || req.user?.superadminId || req.user?._id || null,
      ip: (req.headers["x-forwarded-for"] as string) || req.ip || req.socket.remoteAddress || "",
      userAgent: req.headers["user-agent"] || "",

      // WHAT
      action,
      resource,
      method: req.method,
      url: req.originalUrl || req.url,
      route: req.route?.path || "",
      statusCode: res.statusCode,
      durationMs,
      details: {
        params: req.params,
        query: req.query,
        body: sanitizeMeta(req.body),
      },

      // WHEN
      timestamp: new Date(),
    };

    createAuditLogRepo(logData).catch((err: any) => {
      console.error("⚠️  Failed to save audit log:", err.message);
    });
  });

  next();
};
