import type { mongo } from "mongoose";
import {
  blindIndex,
  decrypt,
  encrypt,
  hashToken,
} from "../../core/security/crypto";
import { toPaise } from "../../core/utils/money";
import { monthNumberFromName, toPeriod } from "../../core/utils/period";
import {
  maskAadhaar,
  MASKED_AADHAAR_PATTERN,
  normalizePhone,
} from "../../core/utils/text";
import type { Migration } from "./types";

const BATCH = 500;
const GENDERS = new Set(["male", "female", "other"]);

const decryptLegacy = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  return decrypt(value); // throws on corrupt data → document is skipped and reported
};

/**
 * Tenants (schemaVersion 1 → 2):
 *  - contact number: AES-CBC → AES-GCM + HMAC blind index
 *  - Aadhaar: full number replaced by masked form + HMAC (never stored in clear)
 *  - gender: plain enum; aadharImage: re-encrypted reference
 *  - money: rupees → integer paise; lastPaidMonth/Year → lastPaidPeriod
 *  - KYC token: plaintext → hash + encrypted copy
 * Idempotent: only documents without schemaVersion 2 are touched.
 */
export const tenantDataProtection: Migration = {
  name: "002-tenant-data-protection",
  description:
    "Re-encrypt tenant PII (AES-GCM), blind-index phones, mask Aadhaar, money to paise",
  async up({ db, dryRun, log }) {
    const tenants = db.collection("tenants");
    let ops: mongo.AnyBulkWriteOperation[] = [];
    let migrated = 0;
    const failed: string[] = [];

    const flush = async () => {
      if (!dryRun && ops.length)
        await tenants.bulkWrite(ops, { ordered: false });
      ops = [];
    };

    for await (const t of tenants.find({ schemaVersion: { $ne: 2 } })) {
      try {
        const phone = normalizePhone(decryptLegacy(t.contactNumber));
        const aadhaar = decryptLegacy(t.aadharNumber);
        const gender = (decryptLegacy(t.gender) ?? "").toLowerCase();
        const image = decryptLegacy(t.aadharImage);
        const lastMonth =
          typeof t.lastPaidMonth === "string"
            ? monthNumberFromName(t.lastPaidMonth)
            : null;

        let aadhaarMasked: string | null = null;
        let aadhaarHash: string | null = null;
        if (aadhaar) {
          const digits = aadhaar.replace(/\D/g, "");
          if (digits.length === 12) {
            aadhaarMasked = maskAadhaar(digits);
            aadhaarHash = blindIndex(digits, "aadhaar");
          } else if (MASKED_AADHAAR_PATTERN.test(aadhaar)) {
            aadhaarMasked = aadhaar;
          }
        }

        ops.push({
          updateOne: {
            filter: { _id: t._id, schemaVersion: { $ne: 2 } },
            update: {
              $set: {
                contactNumber: encrypt(phone),
                contactNumberHash: blindIndex(phone, "phone"),
                aadhaarMasked,
                aadhaarHash,
                gender: GENDERS.has(gender) ? gender : null,
                aadharImage: image ? encrypt(image) : null,
                securityDeposit: toPaise(Number(t.securityDeposit ?? 0)),
                monthlyRent: toPaise(Number(t.monthlyRent ?? 0)),
                pendingBalance: toPaise(Number(t.pendingBalance ?? 0)),
                lastPaidPeriod:
                  lastMonth && typeof t.lastPaidYear === "number"
                    ? toPeriod(t.lastPaidYear, lastMonth)
                    : null,
                kycTokenHash:
                  typeof t.kycToken === "string" && t.kycToken
                    ? hashToken(t.kycToken)
                    : null,
                kycTokenEnc:
                  typeof t.kycToken === "string" && t.kycToken
                    ? encrypt(t.kycToken)
                    : null,
                age: typeof t.age === "number" ? t.age : null,
                occupantsCount: Math.max(1, Number(t.occupantsCount ?? 1)),
                schemaVersion: 2,
              },
              $unset: {
                aadharNumber: "",
                lastPaidMonth: "",
                lastPaidYear: "",
                kycToken: "",
              },
            },
          },
        });
        migrated++;
      } catch {
        failed.push(String(t._id));
      }
      if (ops.length >= BATCH) await flush();
    }
    await flush();

    log.info({ migrated, failed: failed.length }, "tenants processed");
    if (failed.length) {
      throw new Error(
        `${failed.length} tenant(s) could not be decrypted (check ENCRYPTION_PASSWORD): ${failed.slice(0, 20).join(", ")}`,
      );
    }
  },
};
