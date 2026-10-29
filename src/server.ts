import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import connectDB from "./config/mongo.config";
import { verifyEmailServiceConnection } from "./utils/emailService";
import { responseMiddleware } from "./middlewares/responseMiddleware";
import { errorMiddleware } from "./middlewares/errorMiddleware";
import { auditLog } from "./middlewares/auditMiddleware";

import authRoutes from "./routes/auth";
import flatRoutes from "./routes/flats";
import tenantRoutes from "./routes/tenants";
import dashboardRoutes from "./routes/dashboard";
import addressRoutes from "./routes/address";
import userRoutes from "./routes/user.routes";
import auditRoutes from "./routes/audit.routes";
import floorRoutes from "./routes/floor.routes";
import kycRoutes from "./routes/kyc.routes";
import maintenanceRoutes from "./routes/maintenance.routes";
import whatsappRoutes from "./routes/whatsapp.routes";

// Load env vars
dotenv.config();

// Connect to database and verify email connection (only in non-test mode)
if (process.env.NODE_ENV !== "test") {
  connectDB();
  verifyEmailServiceConnection();
}

const app = express();
app.disable("etag"); // Disable ETags to prevent 304 Not Modified responses

// Request Correlation ID Middleware (Industry standard for tracing & audit)
app.use((req: Request, res: Response, next: NextFunction) => {
  const incomingId = req.headers["x-request-id"] as string;
  const requestId = incomingId || crypto.randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Non-blocking Database Audit Logging Middleware (Who, When, What)
app.use(auditLog);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/flats", flatRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/floors", floorRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Nivaasa (निवास) API Engine is running...");
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Post-route Middlewares
app.use(responseMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(
      `Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`,
    );
  });
}

export { app };
