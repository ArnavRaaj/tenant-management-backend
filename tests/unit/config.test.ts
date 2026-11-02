import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env";

const key = () => crypto.randomBytes(32).toString("base64");

/** Minimal production environment: only the security-critical values. */
const prodEnv = (overrides: Record<string, string> = {}) =>
  ({
    NODE_ENV: "production",
    MONGO_URI: "mongodb+srv://user:pass@cluster.example.net/",
    JWT_ACCESS_SECRET: "a".repeat(48),
    JWT_REFRESH_SECRET: "b".repeat(48),
    ENCRYPTION_KEY: key(),
    HMAC_KEY: key(),
    FRONTEND_URL: "https://app.example.com",
    ...overrides,
  }) as NodeJS.ProcessEnv;

describe("Production configuration", () => {
  it("boots without Redis, Surepass, Meta or Cloudinary by falling back", () => {
    const config = loadConfig(
      prodEnv({ KYC_PROVIDER: "surepass", WHATSAPP_PROVIDER: "meta" }),
    );

    expect(config.isProduction).toBe(true);
    expect(config.redisUrl).toBeNull();
    expect(config.kyc).toMatchObject({ provider: "mock", simulated: true });
    expect(config.whatsapp.provider).toBe("simulator");
    expect(config.whatsapp.webhookVerifyToken).toMatch(/^[0-9a-f]{48}$/); // random, not a public default
    expect(config.whatsapp.simulatorEnabled).toBe(false); // dev endpoint never exposed in production
    expect(config.fallbacks.join("\n")).toMatch(/KYC/);
    expect(config.fallbacks.join("\n")).toMatch(/Redis/);
    expect(config.fallbacks.join("\n")).toMatch(/WhatsApp/);
  });

  it("uses the real providers when their credentials are present", () => {
    const config = loadConfig(
      prodEnv({
        SUREPASS_API_TOKEN: "token",
        REDIS_URL: "redis://cache:6379",
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_PHONE_NUMBER_ID: "123",
        WHATSAPP_ACCESS_TOKEN: "abc",
        WHATSAPP_APP_SECRET: "secret",
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
      }),
    );
    expect(config.kyc).toMatchObject({
      provider: "surepass",
      simulated: false,
    });
    expect(config.whatsapp.provider).toBe("meta");
    expect(config.redisUrl).toBe("redis://cache:6379");
    expect(config.fallbacks.some((f) => /KYC|Redis|WhatsApp/.test(f))).toBe(
      false,
    );
  });

  it.each([
    ["JWT_ACCESS_SECRET", /JWT_ACCESS_SECRET/],
    ["JWT_REFRESH_SECRET", /JWT_REFRESH_SECRET/],
    ["ENCRYPTION_KEY", /ENCRYPTION_KEY/],
    ["HMAC_KEY", /HMAC_KEY/],
    ["MONGO_URI", /MONGO_URI/],
  ])(
    "still refuses to start without %s (no insecure fallback for secrets)",
    (name, pattern) => {
      expect(() => loadConfig(prodEnv({ [name]: "" }))).toThrow(pattern);
    },
  );

  it("rejects identical access and refresh secrets", () => {
    expect(() =>
      loadConfig(prodEnv({ JWT_REFRESH_SECRET: "a".repeat(48) })),
    ).toThrow(/must differ/);
  });

  it("defaults the refresh cookie to SameSite=None + Secure for cross-site deployments", () => {
    const config = loadConfig(prodEnv());
    expect(config.auth).toMatchObject({
      cookieSameSite: "none",
      cookieSecure: true,
    });
    const proxied = loadConfig(prodEnv({ REFRESH_COOKIE_SAMESITE: "lax" }));
    expect(proxied.auth).toMatchObject({
      cookieSameSite: "lax",
      cookieSecure: true,
    });
  });
});
