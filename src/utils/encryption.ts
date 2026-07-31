import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "tenant-mgmt-salt"; // Static salt for deterministic key derivation

/**
 * Derives a 32-byte encryption key from the ENCRYPTION_PASSWORD
 * using scryptSync (industry-standard key derivation function).
 */
const getKey = (): Buffer => {
  const password = process.env.ENCRYPTION_PASSWORD;
  if (!password) {
    throw new Error("ENCRYPTION_PASSWORD is not set in environment variables");
  }
  return crypto.scryptSync(password, SALT, KEY_LENGTH);
};

/**
 * Encrypts plaintext using AES-256-CBC.
 * A random IV is generated per call for maximum security.
 * Returns the result as "iv:encryptedData" (both hex-encoded).
 */
export const encrypt = (text: string): string => {
  if (!text) return text;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
};

/**
 * Decrypts an "iv:encryptedData" string back to plaintext.
 * Returns the original string if it doesn't appear to be encrypted.
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText) return encryptedText;

  // If the string doesn't contain ":", it's not encrypted — return as-is
  // This handles backward compatibility with existing unencrypted data
  if (!encryptedText.includes(":")) return encryptedText;

  try {
    const [ivHex, encrypted] = encryptedText.split(":");
    if (!ivHex || !encrypted) return encryptedText;

    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails (e.g., old unencrypted data), return original
    return encryptedText;
  }
};

export const ENCRYPTED_TENANT_FIELDS = [
  "contactNumber",
  "aadharNumber",
  "gender",
  "aadharImage",
];

export const encryptTenantFields = (data: any): any => {
  if (!data) return data;
  const encrypted = { ...data };
  for (const field of ENCRYPTED_TENANT_FIELDS) {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  }
  return encrypted;
};

export const decryptTenantFields = (tenant: any): any => {
  if (!tenant) return tenant;
  const obj = tenant.toObject ? tenant.toObject() : { ...tenant };
  for (const field of ENCRYPTED_TENANT_FIELDS) {
    if (obj[field]) {
      obj[field] = decrypt(obj[field]);
    }
  }
  return obj;
};
