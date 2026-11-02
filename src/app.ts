import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config/env";
import { isDatabaseReady } from "./config/database";
import { pingRedis } from "./config/redis";
import { responseMiddleware } from "./core/http/apiResponse";
import { logger } from "./core/logger";
import { errorHandler, notFoundHandler } from "./core/middleware/errorHandler";
import { RateLimits, rateLimit } from "./core/middleware/rateLimit";
import { requestContext } from "./core/middleware/requestContext";
import { sanitizeInput } from "./core/middleware/sanitizeInput";
import addressRoutes from "./modules/addresses/address.routes";
import auditRoutes from "./modules/audit/audit.routes";
import authRoutes from "./modules/auth/auth.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import flatRoutes from "./modules/flats/flat.routes";
import floorRoutes from "./modules/floors/floor.routes";
import kycRoutes from "./modules/kyc/kyc.routes";
import maintenanceRoutes from "./modules/maintenance/maintenance.routes";
import tenantRoutes from "./modules/tenants/tenant.routes";
import userRoutes from "./modules/users/user.routes";
import whatsappRoutes from "./modules/whatsapp/whatsapp.routes";
import { pendingMigrations } from "./scripts/migrations/runner";

const healthRoutes = () => {
  const router = express.Router();

  // Liveness: the process is up (used by orchestrators to restart hung pods).
  router.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness: dependencies reachable and schema migrated (load balancer gate).
  router.get("/ready", async (_req: Request, res: Response) => {
    const database = isDatabaseReady();
    const redis = await pingRedis();
    const pending = database
      ? await pendingMigrations().catch(() => ["unknown"])
      : [];
    const ready = database && redis && pending.length === 0;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      checks: {
        database,
        redis,
        migrations: pending.length === 0 ? "ok" : pending,
      },
    });
  });
  return router;
};

export const createApp = (): Express => {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag"); // API responses are dynamic; avoid 304s on stale caches
  // Number of trusted reverse-proxy hops: makes req.ip the real client IP
  // (rate limiting / audit) without trusting spoofed X-Forwarded-For headers.
  app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(
          null,
          !origin || config.corsOrigins.includes(origin.replace(/\/$/, "")),
        ),
      credentials: true, // refresh-token cookie
      exposedHeaders: [
        "X-Request-Id",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "Retry-After",
      ],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(
    express.json({
      limit: "100kb",
      // Keep raw bytes for webhook signature verification only.
      verify: (req, _res, buf) => {
        const r = req as Request;
        if (r.originalUrl?.startsWith("/api/whatsapp/webhook"))
          r.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser());

  // After body parsing so the AsyncLocalStorage scope survives into handlers.
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId,
      autoLogging: {
        ignore: (req) => (req.url ?? "").startsWith("/api/health"),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info",
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          url: req.url.split("?")[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(sanitizeInput);

  app.get("/", (_req, res) => {
    res.send("Nivaasa (निवास) API Engine is running...");
  });
  app.use("/api/health", healthRoutes());

  app.use("/api", rateLimit(RateLimits.global));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/flats", flatRoutes);
  app.use("/api/floors", floorRoutes);
  app.use("/api/addresses", addressRoutes);
  app.use("/api/tenants", tenantRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/maintenance", maintenanceRoutes);
  app.use("/api/kyc", kycRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/audit-logs", auditRoutes);

  app.use(responseMiddleware);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

export const app = createApp();
