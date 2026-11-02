import pino from "pino";
import { config } from "../config/env";
import { getRequestContext } from "./requestContext";

/**
 * Structured JSON logger. Secrets and personal data are redacted at the
 * logger level so an accidental `logger.info({ body })` cannot leak them.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "nivaasa-api", env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const ctx = getRequestContext();
    return ctx ? { requestId: ctx.requestId, userId: ctx.userId } : {};
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.confirmPassword",
      "*.otp",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.aadharNumber",
      "*.contactNumber",
      "*.phone",
    ],
    censor: "[REDACTED]",
  },
  ...(config.isProduction || config.isTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }),
});

export type Logger = typeof logger;
