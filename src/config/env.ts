import crypto from "crypto";
import dotenv from "dotenv";
import Joi from "joi";

dotenv.config({ quiet: true });

export type NodeEnv = "development" | "production" | "test";
export type SameSiteOption = "lax" | "strict" | "none";

export interface AppConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  trustProxy: number;
  logLevel: string;

  mongo: {
    uri: string;
    dbName: string;
    maxPoolSize: number;
    minPoolSize: number;
    allowStandalone: boolean;
  };
  redisUrl: string | null;
  runWorkers: boolean;

  frontendUrl: string;
  corsOrigins: string[];

  auth: {
    accessSecret: string;
    refreshSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    issuer: string;
    audience: string;
    bcryptRounds: number;
    cookieSecure: boolean;
    cookieSameSite: SameSiteOption;
    otpTtlMinutes: number;
    otpMaxAttempts: number;
    inviteTtlDays: number;
    kycLinkTtlHours: number;
  };

  encryption: {
    /** Active 32-byte key used for new ciphertexts */
    key: Buffer;
    /** Older keys still accepted for decryption (rotation) */
    previousKeys: Buffer[];
    /** Key derived from the legacy ENCRYPTION_PASSWORD (AES-CBC v1 data) */
    legacyKey: Buffer | null;
    /** Separate key for HMAC blind indexes and token hashing */
    hmacKey: Buffer;
  };

  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    enabled: boolean;
    signedUrlTtlSeconds: number;
  };

  email: {
    resendApiKey: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    from: string;
  };

  kyc: {
    provider: "mock" | "surepass";
    surepassToken: string;
    surepassBaseUrl: string;
  };

  geminiApiKey: string;

  whatsapp: {
    provider: "simulator" | "meta";
    phoneNumberId: string;
    accessToken: string;
    apiVersion: string;
    webhookVerifyToken: string;
    appSecret: string;
    simulatorEnabled: boolean;
  };

  externalHttpTimeoutMs: number;
  auditRetentionDays: number;
  whatsappLogRetentionDays: number;
}

const DEV_ONLY_DEFAULT_SECRET = "dev-only-insecure-secret-change-me";

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().port().default(5000),
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
  LOG_LEVEL: Joi.string()
    .valid("fatal", "error", "warn", "info", "debug", "trace", "silent", "")
    .optional(),

  MONGO_URI: Joi.string()
    .uri({ scheme: ["mongodb", "mongodb+srv"] })
    .allow(""),
  DATABASE_NAME: Joi.string().default("tenant_management"),
  MONGO_MAX_POOL_SIZE: Joi.number().integer().min(1).default(50),
  MONGO_MIN_POOL_SIZE: Joi.number().integer().min(0).default(5),
  // Dev convenience only: run without transactions on a standalone mongod.
  // Always disabled in production (transactions are mandatory there).
  MONGO_ALLOW_STANDALONE: Joi.boolean().default(true),
  REDIS_URL: Joi.string()
    .uri({ scheme: ["redis", "rediss"] })
    .allow("")
    .optional(),
  RUN_WORKERS: Joi.boolean().default(true),

  FRONTEND_URL: Joi.string().uri().default("http://localhost:3000"),
  CORS_ORIGINS: Joi.string().allow("").optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).allow("").optional(),
  JWT_REFRESH_SECRET: Joi.string().min(32).allow("").optional(),
  // Legacy single secret — used as a fallback for the access secret
  JWT_SECRET: Joi.string().min(16).allow("").optional(),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  REFRESH_COOKIE_SAMESITE: Joi.string()
    .valid("lax", "strict", "none", "")
    .optional(),
  OTP_TTL_MINUTES: Joi.number().integer().min(1).max(60).default(10),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(1).max(10).default(5),
  INVITE_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),
  KYC_LINK_TTL_HOURS: Joi.number().integer().min(1).max(720).default(72),

  // 32-byte key, base64 or 64-char hex
  ENCRYPTION_KEY: Joi.string().allow("").optional(),
  ENCRYPTION_PREVIOUS_KEYS: Joi.string().allow("").optional(),
  // Legacy passphrase (AES-CBC v1). Still accepted to read old data.
  ENCRYPTION_PASSWORD: Joi.string().allow("").optional(),
  HMAC_KEY: Joi.string().allow("").optional(),

  CLOUDINARY_CLOUD_NAME: Joi.string().allow("").optional(),
  CLOUDINARY_API_KEY: Joi.string().allow("").optional(),
  CLOUDINARY_API_SECRET: Joi.string().allow("").optional(),
  CLOUDINARY_SIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .default(600),

  RESEND_API_KEY: Joi.string().allow("").optional(),
  SMTP_HOST: Joi.string().allow("").optional(),
  SMTP_PORT: Joi.number().port().empty("").optional(),
  SMTP_USER: Joi.string().allow("").optional(),
  SMTP_PASS: Joi.string().allow("").optional(),
  EMAIL_FROM: Joi.string().allow("").optional(),

  KYC_PROVIDER: Joi.string().valid("mock", "surepass", "").optional(),
  SUREPASS_API_TOKEN: Joi.string().allow("").optional(),
  SUREPASS_BASE_URL: Joi.string()
    .uri()
    .default("https://sandbox.surepass.io/api/v1"),

  GEMINI_API_KEY: Joi.string().allow("").optional(),

  WHATSAPP_PROVIDER: Joi.string()
    .valid("simulator", "meta")
    .default("simulator"),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow("").optional(),
  WHATSAPP_ACCESS_TOKEN: Joi.string().allow("").optional(),
  WHATSAPP_API_VERSION: Joi.string().default("v21.0"),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().allow("").optional(),
  WHATSAPP_APP_SECRET: Joi.string().allow("").optional(),
  ENABLE_WHATSAPP_SIMULATOR: Joi.boolean().optional(),

  EXTERNAL_HTTP_TIMEOUT_MS: Joi.number().integer().min(500).default(8000),
  AUDIT_RETENTION_DAYS: Joi.number().integer().min(1).default(365),
  WHATSAPP_LOG_RETENTION_DAYS: Joi.number().integer().min(1).default(180),
}).unknown(true);

const parseKey = (raw: string, name: string): Buffer => {
  const value = raw.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (buf.length !== 32) {
    throw new Error(`${name} must be a 32-byte key (base64 or 64-char hex)`);
  }
  return buf;
};

/** Matches the key derivation used by the original AES-CBC implementation. */
const deriveLegacyKey = (password: string): Buffer =>
  crypto.scryptSync(password, "tenant-mgmt-salt", 32);

const deriveSubKey = (master: Buffer, info: string): Buffer =>
  Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), info, 32));

const fail = (message: string): never => {
  throw new Error(`Invalid environment configuration: ${message}`);
};

export const loadConfig = (
  source: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const { value: env, error } = schema.validate(source, {
    abortEarly: false,
    convert: true,
  });
  if (error) {
    fail(error.details.map((d) => d.message).join("; "));
  }

  const nodeEnv = env.NODE_ENV as NodeEnv;
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";

  const requireInProd = (name: string, value: string | undefined): string => {
    if (value && value.length > 0) return value;
    if (isProduction) fail(`${name} is required in production`);
    return "";
  };

  const mongoUri = requireInProd("MONGO_URI", env.MONGO_URI);

  // ── Secrets: required in production, insecure defaults only in dev/test ──
  const accessSecret =
    env.JWT_ACCESS_SECRET ||
    env.JWT_SECRET ||
    (isProduction
      ? fail("JWT_ACCESS_SECRET is required in production")
      : DEV_ONLY_DEFAULT_SECRET + "-access");
  const refreshSecret =
    env.JWT_REFRESH_SECRET ||
    (isProduction
      ? fail("JWT_REFRESH_SECRET is required in production")
      : DEV_ONLY_DEFAULT_SECRET + "-refresh");
  if (isProduction && accessSecret === refreshSecret) {
    fail("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  }

  const legacyPassword: string = env.ENCRYPTION_PASSWORD || "";
  const legacyKey = legacyPassword ? deriveLegacyKey(legacyPassword) : null;

  let key: Buffer;
  if (env.ENCRYPTION_KEY) {
    key = parseKey(env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
  } else if (legacyKey) {
    // Backward compatible: reuse the key derived from the legacy passphrase
    key = legacyKey;
  } else if (isProduction) {
    key = fail("ENCRYPTION_KEY is required in production");
  } else {
    key = deriveLegacyKey(DEV_ONLY_DEFAULT_SECRET);
  }

  const previousKeys = (env.ENCRYPTION_PREVIOUS_KEYS || "")
    .split(",")
    .map((k: string) => k.trim())
    .filter(Boolean)
    .map((k: string) => parseKey(k, "ENCRYPTION_PREVIOUS_KEYS"));

  // Blind indexes (phone lookups) and OTP hashes are keyed by HMAC_KEY, so it
  // must stay constant for the life of the data — independent of
  // ENCRYPTION_KEY, which is meant to be rotated.
  let hmacKey: Buffer;
  if (env.HMAC_KEY) {
    hmacKey = parseKey(env.HMAC_KEY, "HMAC_KEY");
  } else if (isProduction) {
    hmacKey = fail(
      "HMAC_KEY is required in production (and must never change once data exists)",
    );
  } else {
    hmacKey = deriveSubKey(key, "nivaasa-hmac-v1");
  }

  const frontendUrl: string = env.FRONTEND_URL;
  const corsOrigins = (env.CORS_ORIGINS || frontendUrl)
    .split(",")
    .map((o: string) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  const cloudinaryEnabled = Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET &&
    env.CLOUDINARY_CLOUD_NAME !== "your_cloudinary_cloud_name",
  );

  const surepassToken: string = env.SUREPASS_API_TOKEN || "";
  const kycProvider: "mock" | "surepass" =
    env.KYC_PROVIDER || (isProduction ? "surepass" : "mock");
  if (kycProvider === "surepass" && !surepassToken && isProduction) {
    fail("SUREPASS_API_TOKEN is required when KYC_PROVIDER=surepass");
  }
  if (kycProvider === "mock" && isProduction) {
    fail("KYC_PROVIDER=mock is not allowed in production");
  }

  const whatsappProvider: "simulator" | "meta" = env.WHATSAPP_PROVIDER;
  const webhookVerifyToken = isProduction
    ? requireInProd(
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
        env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      )
    : env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "nivaasa_whatsapp_verify_token_dev";
  const appSecret: string = env.WHATSAPP_APP_SECRET || "";
  if (isProduction && whatsappProvider === "meta" && !appSecret) {
    fail("WHATSAPP_APP_SECRET is required to verify Meta webhook signatures");
  }

  const sameSite: SameSiteOption =
    env.REFRESH_COOKIE_SAMESITE || (isProduction ? "none" : "lax");

  return {
    nodeEnv,
    isProduction,
    isTest,
    port: env.PORT,
    trustProxy: env.TRUST_PROXY,
    logLevel:
      env.LOG_LEVEL || (isTest ? "silent" : isProduction ? "info" : "debug"),

    mongo: {
      uri: mongoUri,
      dbName: env.DATABASE_NAME,
      maxPoolSize: env.MONGO_MAX_POOL_SIZE,
      minPoolSize: env.MONGO_MIN_POOL_SIZE,
      allowStandalone: !isProduction && env.MONGO_ALLOW_STANDALONE !== false,
    },
    redisUrl: env.REDIS_URL ? env.REDIS_URL : null,
    runWorkers: env.RUN_WORKERS,

    frontendUrl: frontendUrl.replace(/\/$/, ""),
    corsOrigins,

    auth: {
      accessSecret,
      refreshSecret,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      issuer: "nivaasa-api",
      audience: "nivaasa-web",
      bcryptRounds: isTest ? 4 : env.BCRYPT_ROUNDS,
      cookieSecure: isProduction || sameSite === "none",
      cookieSameSite: sameSite,
      otpTtlMinutes: env.OTP_TTL_MINUTES,
      otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
      inviteTtlDays: env.INVITE_TTL_DAYS,
      kycLinkTtlHours: env.KYC_LINK_TTL_HOURS,
    },

    encryption: { key, previousKeys, legacyKey, hmacKey },

    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME || "",
      apiKey: env.CLOUDINARY_API_KEY || "",
      apiSecret: env.CLOUDINARY_API_SECRET || "",
      enabled: cloudinaryEnabled,
      signedUrlTtlSeconds: env.CLOUDINARY_SIGNED_URL_TTL_SECONDS,
    },

    email: {
      resendApiKey: env.RESEND_API_KEY || "",
      smtpHost: env.SMTP_HOST || "",
      smtpPort: env.SMTP_PORT ?? 465,
      smtpUser: env.SMTP_USER || "",
      smtpPass: (env.SMTP_PASS || "").replace(/\s+/g, ""),
      from: env.EMAIL_FROM || "",
    },

    kyc: {
      provider:
        kycProvider === "surepass" && surepassToken ? "surepass" : "mock",
      surepassToken,
      surepassBaseUrl: env.SUREPASS_BASE_URL,
    },

    geminiApiKey: env.GEMINI_API_KEY || "",

    whatsapp: {
      provider: whatsappProvider,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
      apiVersion: env.WHATSAPP_API_VERSION,
      webhookVerifyToken,
      appSecret,
      simulatorEnabled:
        !isProduction && env.ENABLE_WHATSAPP_SIMULATOR !== false,
    },

    externalHttpTimeoutMs: env.EXTERNAL_HTTP_TIMEOUT_MS,
    auditRetentionDays: env.AUDIT_RETENTION_DAYS,
    whatsappLogRetentionDays: env.WHATSAPP_LOG_RETENTION_DAYS,
  };
};

export const config: AppConfig = loadConfig();
