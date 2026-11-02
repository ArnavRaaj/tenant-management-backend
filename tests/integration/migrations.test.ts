import crypto from "crypto";
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { decrypt } from "../../src/core/security/crypto";
import {
  pendingMigrations,
  runMigrations,
} from "../../src/scripts/migrations/runner";
import { contactHash } from "../../src/modules/tenants/tenant.service";
import { useTestDatabase } from "../helpers/db";

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

describe("Data migrations (legacy → v2)", () => {
  useTestDatabase({ indexes: false });

  it("migrates legacy users, tenants, rent and logs, is idempotent, and clears the readiness gate", async () => {
    const db = mongoose.connection.db!;
    const ownerId = new mongoose.Types.ObjectId();
    const flatId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    // ── Seed data exactly as the old code stored it ──
    await db.collection("users").insertOne({
      _id: ownerId,
      name: "Owner",
      email: "Owner@Example.com",
      role: "superadmin",
      superadminId: null,
      isVerified: true,
      password: "$2a$10$hash",
      inviteToken: "plain-invite-token",
      resetPasswordOtp: "123456",
    });
    // The legacy schema had a GLOBAL unique floor number.
    await db
      .collection("floors")
      .createIndex({ floorNumber: 1 }, { unique: true, name: "floorNumber_1" });
    await db
      .collection("floors")
      .insertOne({ floorNumber: 0, name: "Lobby", order: 0, isActive: true });
    await db.collection("flats").insertOne({
      _id: flatId,
      flatNumber: "302",
      floor: 3,
      buildingName: "Tower",
      currentTenant: tenantId,
      organizationId: ownerId,
    });
    await db.collection("tenants").insertOne({
      _id: tenantId,
      name: "Rahul",
      contactNumber: legacyEncrypt("9876543210"),
      aadharNumber: legacyEncrypt("234567890123"),
      gender: legacyEncrypt("Male"),
      aadharImage: legacyEncrypt("https://res.cloudinary.com/demo/aadhar.png"),
      securityDeposit: 30000,
      monthlyRent: 15000.5,
      pendingBalance: 2500,
      lastPaidMonth: "October",
      lastPaidYear: 2026,
      kycToken: "a".repeat(64),
      kycStatus: "PENDING",
      isActive: true,
      flat: flatId,
      organizationId: ownerId,
    });
    await db.collection("renthistories").insertMany([
      {
        tenant: tenantId,
        flat: flatId,
        amountPaid: 15000,
        rentMonth: "October",
        rentYear: 2026,
        receiptNumber: "REC-1",
        organizationId: ownerId,
        paymentDate: new Date(),
      },
      {
        tenant: tenantId,
        flat: flatId,
        amountPaid: 100,
        rentMonth: "October",
        rentYear: 2026,
        receiptNumber: "REC-1",
        organizationId: ownerId,
        paymentDate: new Date(),
      },
    ]);
    await db.collection("auditlogs").insertOne({
      action: "POST_TENANTS",
      method: "POST",
      url: "/api/tenants?x=1",
      statusCode: 201,
      details: { body: { aadharNumber: "234567890123" } },
      organizationId: ownerId,
    });

    // ── Dry run changes nothing ──
    await runMigrations({ dryRun: true });
    expect(
      (await db.collection("tenants").findOne({ _id: tenantId }))?.monthlyRent,
    ).toBe(15000.5);

    await runMigrations({ dryRun: false });
    expect(await pendingMigrations()).toEqual([]);

    const user = await db.collection("users").findOne({ _id: ownerId });
    expect(user?.email).toBe("owner@example.com");
    expect(user?.inviteToken).toBeUndefined();
    expect(user?.resetPasswordOtp).toBeUndefined();
    expect(user?.invite.tokenHash).toHaveLength(64);

    const floors = await db.collection("floors").find({}).toArray();
    expect(
      floors.every((f) => String(f.organizationId) === String(ownerId)),
    ).toBe(true);
    expect(floors.find((f) => f.floorNumber === 0)?.name).toBe("Lobby");

    const t = await db.collection("tenants").findOne({ _id: tenantId });
    expect(t?.schemaVersion).toBe(2);
    expect(t?.contactNumber).toMatch(/^v2:/);
    expect(decrypt(t?.contactNumber)).toBe("9876543210");
    expect(t?.contactNumberHash).toBe(contactHash("9876543210"));
    expect(t?.aadhaarMasked).toBe("XXXX-XXXX-0123");
    expect(JSON.stringify(t)).not.toContain("234567890123");
    expect(t?.gender).toBe("male");
    expect(t?.monthlyRent).toBe(1_500_050);
    expect(t?.lastPaidPeriod).toBe(202610);
    expect(t?.kycToken).toBeUndefined();
    expect(t?.kycTokenHash).toHaveLength(64);

    const rents = await db.collection("renthistories").find({}).toArray();
    expect(rents.map((r) => r.period)).toEqual([202610, 202610]);
    expect(rents.map((r) => r.floor)).toEqual([3, 3]);
    expect(new Set(rents.map((r) => r.receiptNumber)).size).toBe(2); // duplicates de-conflicted

    const audit = await db
      .collection("auditlogs")
      .findOne({ action: "POST_TENANTS" });
    expect(audit?.details).toBeUndefined();
    expect(audit?.path).toBe("/api/tenants");

    // ── Idempotent: a second run has nothing to do ──
    expect(await runMigrations({ dryRun: false })).toEqual([]);
  });
});
