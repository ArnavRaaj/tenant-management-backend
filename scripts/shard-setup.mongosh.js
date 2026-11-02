/**
 * MongoDB sharding setup — run ONLY on a sharded cluster (Atlas M30+ or a
 * self-managed mongos), when a single replica set is no longer enough:
 *
 *   mongosh "<mongos-uri>" scripts/shard-setup.mongosh.js
 *
 * Shard key strategy: { organizationId: 1, _id: 1 }
 *   - organizationId first → every tenant-scoped query (all hot paths filter
 *     by it) is routed to a single shard; one organisation's data is co-located.
 *   - _id second → large organisations can still be split across chunks.
 *
 * The application is already shard-ready:
 *   - every unique index is prefixed by organizationId
 *     (flat numbers, receipt numbers, ticket numbers, idempotency keys);
 *   - KYC tokens embed the organisation id so lookups are targeted;
 *   - transactions touch documents of a single organisation.
 *
 * Collections NOT sharded (small or globally looked up): users,
 * refreshtokens, counters, schema_migrations, floors, addresses.
 */
const dbName = process.env.DATABASE_NAME || "tenant_management";

sh.enableSharding(dbName);

const shardKey = { organizationId: 1, _id: 1 };
const collections = [
  "flats",
  "tenants",
  "renthistories",
  "maintenancetickets",
  "auditlogs",
  "whatsappmessages",
];

for (const name of collections) {
  const ns = `${dbName}.${name}`;
  db.getSiblingDB(dbName)[name].createIndex(shardKey);
  printjson({ ns, result: sh.shardCollection(ns, shardKey) });
}
