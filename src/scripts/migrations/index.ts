import mongoose from "mongoose";
// Importing the models registers every schema so syncIndexes covers them all.
import "../../core/db/counter.model";
import "../../modules/addresses/address.model";
import "../../modules/audit/auditLog.model";
import "../../modules/auth/refreshToken.model";
import "../../modules/flats/flat.model";
import "../../modules/floors/floor.model";
import "../../modules/maintenance/ticket.model";
import "../../modules/tenants/rent.model";
import "../../modules/tenants/tenant.model";
import "../../modules/users/user.model";
import "../../modules/whatsapp/whatsappMessage.model";
import { usersAndOrgScoping } from "./001-users-and-org-scoping";
import { tenantDataProtection } from "./002-tenant-data-protection";
import { maintenanceAndLogs, rentHistoryV2 } from "./003-rent-maintenance-logs";
import type { Migration } from "./types";

/**
 * Builds every index declared in the schemas and DROPS indexes that are no
 * longer declared (e.g. the old global floorNumber/ticketNumber uniques).
 * Runs last, after data has been reshaped to satisfy the new constraints.
 */
export const syncAllIndexes: Migration = {
  name: "005-sync-indexes",
  description: "Create declared indexes and drop obsolete ones",
  async up({ dryRun, log }) {
    for (const name of mongoose.modelNames()) {
      const model = mongoose.model(name);
      if (dryRun) {
        const diff = await model
          .diffIndexes()
          .catch(() => ({ toCreate: [], toDrop: [] }));
        log.info({ model: name, ...diff }, "index changes (dry run)");
        continue;
      }
      await model.createCollection().catch(() => undefined);
      const dropped = await model.syncIndexes();
      log.info({ model: name, dropped }, "indexes synced");
    }
  },
};

/** Ordered list. Append only — never reorder or edit a migration that has shipped. */
export const migrations: Migration[] = [
  usersAndOrgScoping,
  tenantDataProtection,
  rentHistoryV2,
  maintenanceAndLogs,
  syncAllIndexes,
];
