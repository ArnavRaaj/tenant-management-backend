import type { mongo } from "mongoose";
import { toPaise } from "../../core/utils/money";
import { monthNumberFromName, toPeriod } from "../../core/utils/period";
import type { Migration } from "./types";

const BATCH = 500;

/**
 * Rent history: money → paise, month name → number + YYYYMM period,
 * denormalised floor, unique receipt numbers per organisation.
 */
export const rentHistoryV2: Migration = {
  name: "003-rent-history-v2",
  description:
    "Rent amounts to paise, numeric periods, denormalised floor, unique receipts",
  async up({ db, dryRun, log }) {
    const floorOf = new Map<string, number>();
    for await (const f of db
      .collection("flats")
      .find({}, { projection: { floor: 1 } })) {
      floorOf.set(String(f._id), Number(f.floor ?? 0));
    }

    const rents = db.collection("renthistories");
    const seen = new Set<string>();
    let ops: mongo.AnyBulkWriteOperation[] = [];
    let migrated = 0;
    let skipped = 0;

    for await (const r of rents
      .find({ schemaVersion: { $ne: 2 } })
      .sort({ _id: 1 })) {
      const month =
        typeof r.rentMonth === "number"
          ? r.rentMonth
          : monthNumberFromName(String(r.rentMonth ?? ""));
      const year = Number(r.rentYear);
      if (!month || !year) {
        skipped++;
        continue;
      }
      let receipt =
        typeof r.receiptNumber === "string" && r.receiptNumber
          ? r.receiptNumber
          : `REC-LEGACY-${String(r._id).slice(-8).toUpperCase()}`;
      const key = `${String(r.organizationId)}:${receipt}`;
      if (seen.has(key))
        receipt = `${receipt}-${String(r._id).slice(-4).toUpperCase()}`;
      seen.add(`${String(r.organizationId)}:${receipt}`);

      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: {
            $set: {
              amountPaid: toPaise(Number(r.amountPaid ?? 0)),
              rentMonth: month,
              rentYear: year,
              period: toPeriod(year, month),
              floor: floorOf.get(String(r.flat)) ?? 0,
              receiptNumber: receipt,
              idempotencyKey: null,
              schemaVersion: 2,
            },
          },
        },
      });
      migrated++;
      if (ops.length >= BATCH) {
        if (!dryRun) await rents.bulkWrite(ops, { ordered: false });
        ops = [];
      }
    }
    if (!dryRun && ops.length) await rents.bulkWrite(ops, { ordered: false });
    log.info({ migrated, skipped }, "rent records processed");
  },
};

/**
 * Maintenance tickets get an explicit source; WhatsApp raw payloads (PII)
 * are dropped; legacy audit logs lose their unredacted request bodies.
 */
export const maintenanceAndLogs: Migration = {
  name: "004-maintenance-and-log-hygiene",
  description:
    "Ticket source default, purge raw WhatsApp payloads and unredacted audit bodies",
  async up({ db, dryRun, log }) {
    const tickets = db.collection("maintenancetickets");
    const wa = db.collection("whatsappmessages");
    const audit = db.collection("auditlogs");

    const counts = {
      tickets: await tickets.countDocuments({ source: { $exists: false } }),
      whatsapp: await wa.countDocuments({ metadata: { $exists: true } }),
      audit: await audit.countDocuments({ details: { $exists: true } }),
    };
    log.info(counts, "documents to clean");
    if (dryRun) return;

    await tickets.updateMany(
      { source: { $exists: false } },
      { $set: { source: "PORTAL" } },
    );
    await wa.updateMany(
      { metadata: { $exists: true } },
      { $unset: { metadata: "" } },
    );

    // Legacy audit entries stored raw request bodies (Aadhaar, phone numbers).
    for await (const a of audit.find({ details: { $exists: true } })) {
      await audit.updateOne(
        { _id: a._id },
        {
          $set: {
            actor: {
              userId: a.userId ?? null,
              email: a.email ?? "",
              role: a.role ?? "anonymous",
            },
            path: typeof a.url === "string" ? a.url.split("?")[0] : "",
            outcome: Number(a.statusCode) < 400 ? "SUCCESS" : "FAILURE",
            request: {},
            changes: [],
            resourceId: null,
            requestId: "",
          },
          $unset: {
            details: "",
            userId: "",
            username: "",
            email: "",
            role: "",
            url: "",
            route: "",
            timestamp: "",
          },
        },
      );
    }
  },
};
