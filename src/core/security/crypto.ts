import crypto from "crypto";
import { config } from "../../config/env";
import { logger } from "../logger";

/**
 * Field-level encryption, keyed hashing and secure random helpers.
 *
 * Ciphertext format (v2): "v2:<keyId>:<iv>:<authTag>:<ciphertext>" (base64url)
 *   - AES-256-GCM: confidentiality + integrity (tampering is detected)
 *   - keyId identifies which key encrypted the value, enabling rotation:
 *     new data uses ENCRYPTION_KEY, old data decrypts with ENCRYPTION_PREVIOUS_KEYS.
 *
 * Legacy format (v1): "<ivHex>:<cipherHex>" AES-256-CBC — readable only,
 * re-encrypted to v2 by the 002 migration.
 */
const GCM_IV_BYTES = 12;
const V2_PREFIX = "v2";
const LEGACY_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;

export class DecryptionError extends Error {
  constructor(message = "Unable to decrypt value") {
    super(message);
    this.name = "DecryptionError";
  }
}

const keyIdOf = (key: Buffer): string =>
  crypto.createHash("sha256").update(key).digest("hex").slice(0, 8);

const keyring = new Map<string, Buffer>();
const registerKey = (key: Buffer) => keyring.set(keyIdOf(key), key);
registerKey(config.encryption.key);
config.encryption.previousKeys.forEach(registerKey);
if (config.encryption.legacyKey) registerKey(config.encryption.legacyKey);
const activeKeyId = keyIdOf(config.encryption.key);

export const encrypt = (plaintext: string): string => {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    config.encryption.key,
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    V2_PREFIX,
    activeKeyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
};

const decryptLegacyCbc = (value: string): string => {
  const [ivHex, dataHex] = value.split(":");
  const candidates = [
    config.encryption.legacyKey,
    config.encryption.key,
  ].filter((k): k is Buffer => Boolean(k));
  for (const key of candidates) {
    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        key,
        Buffer.from(ivHex ?? "", "hex"),
      );
      return Buffer.concat([
        decipher.update(Buffer.from(dataHex ?? "", "hex")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      // try next key
    }
  }
  throw new DecryptionError("Legacy ciphertext could not be decrypted");
};

export const isEncrypted = (value: string): boolean =>
  value.startsWith(`${V2_PREFIX}:`) || LEGACY_PATTERN.test(value);

/** Decrypts v2 or legacy ciphertext. Throws DecryptionError on tampering. */
export const decrypt = (value: string): string => {
  if (value.startsWith(`${V2_PREFIX}:`)) {
    const [, kid, ivB64, tagB64, ctB64] = value.split(":");
    const key = kid ? keyring.get(kid) : undefined;
    if (!key || !ivB64 || !tagB64 || ctB64 === undefined) {
      throw new DecryptionError("Unknown encryption key or malformed value");
    }
    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivB64, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ctB64, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new DecryptionError("Ciphertext failed integrity check");
    }
  }
  if (LEGACY_PATTERN.test(value)) return decryptLegacyCbc(value);
  // Pre-encryption plaintext rows (very old data) are returned unchanged.
  return value;
};

/** Decrypt for read paths: logs and returns null instead of failing the request. */
export const decryptOrNull = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch (err) {
    logger.error({ err }, "Field decryption failed");
    return null;
  }
};

export const needsReencryption = (value: string): boolean =>
  !value.startsWith(`${V2_PREFIX}:${activeKeyId}:`);

/**
 * Deterministic keyed hash (HMAC-SHA256) — a "blind index". Lets us look up
 * encrypted values (e.g. phone numbers) by equality without decrypting.
 */
export const blindIndex = (value: string, domain: string): string =>
  crypto
    .createHmac("sha256", config.encryption.hmacKey)
    .update(`${domain}:${value}`)
    .digest("hex");

/** SHA-256 for high-entropy secrets (random tokens). */
export const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Keyed hash for low-entropy secrets (6-digit OTPs) so DB leaks can't brute-force them offline. */
export const hashOtp = (otp: string, subject: string): string =>
  blindIndex(`${subject}:${otp}`, "otp");

export const generateToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString("hex");

export const generateOtp = (): string =>
  crypto.randomInt(100000, 1000000).toString();

export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};
