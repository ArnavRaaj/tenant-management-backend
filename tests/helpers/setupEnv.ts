/**
 * Runs in every test worker BEFORE application modules load. Explicitly
 * blanks every external credential so a developer's real .env (Atlas URI,
 * SMTP, Cloudinary, Gemini, Meta) can never be used by the test suite —
 * dotenv does not override variables that are already set.
 */
const testEnv: Record<string, string> = {
  NODE_ENV: "test",
  MONGO_URI: process.env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:1/never-used",
  REDIS_URL: "",
  JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-chars",
  JWT_REFRESH_SECRET: "test-refresh-secret-that-is-at-least-32-chars",
  JWT_SECRET: "",
  ENCRYPTION_KEY: "",
  ENCRYPTION_PREVIOUS_KEYS: "",
  ENCRYPTION_PASSWORD: "test-legacy-encryption-password",
  HMAC_KEY: "",
  FRONTEND_URL: "http://localhost:3000",
  CORS_ORIGINS: "http://localhost:3000",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  EMAIL_FROM: "",
  KYC_PROVIDER: "mock",
  SUREPASS_API_TOKEN: "",
  GEMINI_API_KEY: "",
  WHATSAPP_PROVIDER: "simulator",
  WHATSAPP_PHONE_NUMBER_ID: "",
  WHATSAPP_ACCESS_TOKEN: "",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-verify-token",
  WHATSAPP_APP_SECRET: "test-app-secret",
  ENABLE_WHATSAPP_SIMULATOR: "true",
  LOG_LEVEL: "silent",
};
Object.assign(process.env, testEnv);
