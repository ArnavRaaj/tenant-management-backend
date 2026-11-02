import { mongo } from "mongoose";
import { hashToken } from "../../core/security/crypto";
import { DEFAULT_FLOORS } from "../../modules/floors/floor.model";
import type { Migration } from "./types";

type Doc = mongo.Document;

/**
 * Users: plaintext invite tokens → SHA-256 hashes with expiry; plaintext
 * OTPs are discarded (short-lived); adds isActive/tokenVersion.
 * Addresses & floors become organisation-scoped (floors were global).
 */
export const usersAndOrgScoping: Migration = {
  name: "001-users-and-org-scoping",
  description:
    "Hash invite tokens, drop plaintext OTPs, org-scope addresses and floors",
  async up({ db, dryRun, log }) {
    const users = db.collection("users");
    const userOps: mongo.AnyBulkWriteOperation[] = [];
    const orgOf = new Map<string, mongo.ObjectId>();

    for await (const u of users.find({})) {
      const org: mongo.ObjectId =
        u.role === "admin" && u.superadminId ? u.superadminId : u._id;
      orgOf.set(String(u._id), org);
      const set: Doc = {};
      if (typeof u.inviteToken === "string" && u.inviteToken) {
        set.invite = {
          tokenHash: hashToken(u.inviteToken),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        };
      }
      if (u.isActive === undefined) set.isActive = true;
      if (u.tokenVersion === undefined) set.tokenVersion = 0;
      if (typeof u.email === "string" && u.email !== u.email.toLowerCase()) {
        set.email = u.email.toLowerCase();
      }
      userOps.push({
        updateOne: {
          filter: { _id: u._id },
          update: {
            ...(Object.keys(set).length ? { $set: set } : {}),
            $unset: {
              inviteToken: "",
              resetPasswordOtp: "",
              resetPasswordOtpExpire: "",
              emailVerificationOtp: "",
              emailVerificationOtpExpire: "",
            },
          },
        },
      });
    }
    log.info({ users: userOps.length }, "users to update");
    if (!dryRun && userOps.length)
      await users.bulkWrite(userOps, { ordered: false });

    // Addresses: organizationId derived from the creating user.
    const addresses = db.collection("addresses");
    const addressOps: mongo.AnyBulkWriteOperation[] = [];
    for await (const a of addresses.find({
      organizationId: { $exists: false },
    })) {
      const org = orgOf.get(String(a.createdBy));
      if (org) {
        addressOps.push({
          updateOne: {
            filter: { _id: a._id },
            update: { $set: { organizationId: org } },
          },
        });
      }
    }
    log.info({ addresses: addressOps.length }, "addresses to org-scope");
    if (!dryRun && addressOps.length)
      await addresses.bulkWrite(addressOps, { ordered: false });

    // Floors: copy global floors into every organisation, then remove globals.
    const floors = db.collection("floors");
    const globals = await floors
      .find({ organizationId: { $exists: false } })
      .toArray();
    const templates = globals.length
      ? globals.map((f) => ({
          floorNumber: f.floorNumber,
          name: f.name,
          order: f.order ?? f.floorNumber,
          isActive: f.isActive ?? true,
        }))
      : DEFAULT_FLOORS.map((f) => ({ ...f, isActive: true }));
    const orgIds = [...new Set([...orgOf.values()].map(String))].map(
      (id) => new mongo.ObjectId(id),
    );
    log.info(
      { globalFloors: globals.length, organisations: orgIds.length },
      "floors to org-scope",
    );
    if (dryRun) return;

    const indexes = await floors.indexes().catch(() => []);
    if (indexes.some((i) => i.name === "floorNumber_1")) {
      await floors.dropIndex("floorNumber_1"); // global unique index blocks per-org copies
    }
    const floorOps: mongo.AnyBulkWriteOperation[] = orgIds.flatMap((org) =>
      templates.map((t) => ({
        updateOne: {
          filter: { organizationId: org, floorNumber: t.floorNumber },
          update: {
            $setOnInsert: {
              ...t,
              organizationId: org,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
    );
    if (floorOps.length) await floors.bulkWrite(floorOps, { ordered: false });
    await floors.deleteMany({ organizationId: { $exists: false } });
  },
};
