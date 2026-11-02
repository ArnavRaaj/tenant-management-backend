import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  blindIndex,
  decrypt,
  decryptOrNull,
  DecryptionError,
  encrypt,
  generateOtp,
  hashOtp,
  hashToken,
  isEncrypted,
  safeEqual,
} from "../../src/core/security/crypto";
import {
  signAccessToken,
  verifyAccessToken,
} from "../../src/core/security/jwt";
import {
  hashPassword,
  PASSWORD_POLICY,
  verifyPassword,
} from "../../src/core/security/password";
import { permissionsFor } from "../../src/core/security/permissions";

/** Reproduces the original AES-256-CBC implementation to prove backward compatibility. */
const legacyEncrypt = (text: string) => {
  const key = crypto.scryptSync(
    "test-legacy-encryption-password",
    "tenant-mgmt-salt",
    32,
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  return `${iv.toString("hex")}:${cipher.update(text, "utf8", "hex")}${cipher.final("hex")}`;
};

describe("Field encryption (AES-256-GCM)", () => {
  it("round-trips and produces a fresh IV every time", () => {
    const a = encrypt("9876543210");
    const b = encrypt("9876543210");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v2:[0-9a-f]{8}:/);
    expect(decrypt(a)).toBe("9876543210");
  });

  it("detects tampering (authenticated encryption)", () => {
    const parts = encrypt("secret").split(":");
    const ct = Buffer.from(parts[4] as string, "base64url");
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    parts[4] = ct.toString("base64url");
    expect(() => decrypt(parts.join(":"))).toThrow(DecryptionError);
    expect(decryptOrNull(parts.join(":"))).toBeNull();
  });

  it("still decrypts legacy AES-CBC ciphertext from the old implementation", () => {
    const legacy = legacyEncrypt("9123456789");
    expect(isEncrypted(legacy)).toBe(true);
    expect(decrypt(legacy)).toBe("9123456789");
  });

  it("passes through pre-encryption plaintext rows unchanged", () => {
    expect(decrypt("plain value")).toBe("plain value");
  });
});

describe("Hashing", () => {
  it("blind index is deterministic, keyed and domain-separated", () => {
    expect(blindIndex("9876543210", "phone")).toBe(
      blindIndex("9876543210", "phone"),
    );
    expect(blindIndex("9876543210", "phone")).not.toBe(
      blindIndex("9876543210", "aadhaar"),
    );
    expect(blindIndex("9876543210", "phone")).not.toBe(
      crypto.createHash("sha256").update("phone:9876543210").digest("hex"),
    );
  });

  it("OTPs are random 6-digit codes hashed per subject", () => {
    const otps = new Set(Array.from({ length: 50 }, generateOtp));
    expect([...otps].every((o) => /^\d{6}$/.test(o))).toBe(true);
    expect(otps.size).toBeGreaterThan(40);
    expect(hashOtp("123456", "user-a")).not.toBe(hashOtp("123456", "user-b"));
  });

  it("token hashing and constant-time compare", () => {
    expect(hashToken("abc")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("passwords are bcrypt-hashed and verified", async () => {
    const hash = await hashPassword("Str0ng@Pass!");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("Str0ng@Pass!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("password policy", () => {
    expect(PASSWORD_POLICY.test("Str0ng@Pass!")).toBe(true);
    expect(PASSWORD_POLICY.test("password")).toBe(false);
    expect(PASSWORD_POLICY.test("Sh0rt@")).toBe(false);
  });
});

describe("JWT access tokens", () => {
  const claims = {
    sub: "a".repeat(24),
    org: "b".repeat(24),
    role: "admin" as const,
    tv: 0,
  };

  it("signs and verifies with pinned algorithm, issuer and audience", () => {
    const res = verifyAccessToken(signAccessToken(claims));
    expect(res).toEqual({ ok: true, claims });
  });

  it("rejects alg=none and tokens signed with another secret", async () => {
    const { default: jwt } = await import("jsonwebtoken");
    const none = jwt.sign(claims, "", { algorithm: "none" });
    const foreign = jwt.sign(claims, "another-secret-another-secret-123456");
    expect(verifyAccessToken(none)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyAccessToken(foreign)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("RBAC permission map", () => {
  it("superadmin has every permission; admin cannot write tenants or read audit logs", () => {
    expect(permissionsFor("superadmin").has("audit:read")).toBe(true);
    const admin = permissionsFor("admin");
    expect(admin.has("tenant:read")).toBe(true);
    expect(admin.has("maintenance:write")).toBe(true);
    expect(admin.has("tenant:write")).toBe(false);
    expect(admin.has("rent:write")).toBe(false);
    expect(admin.has("audit:read")).toBe(false);
  });
});
