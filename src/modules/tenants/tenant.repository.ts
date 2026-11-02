import type {
  ClientSession,
  PipelineStage,
  Types,
  UpdateQuery,
} from "mongoose";
import { toObjectId } from "../../core/db/objectId";
import { RentHistory, type RentHistoryDoc } from "./rent.model";
import { Tenant, type TenantDoc } from "./tenant.model";
import type { TenantRecord } from "./tenant.mapper";

const FLAT_SUMMARY = "flatNumber floor buildingName";

export interface TenantListFilter {
  isActive: boolean;
  rentDue?: boolean;
}

export const tenantRepository = {
  findById(id: string, organizationId: string, session?: ClientSession) {
    return Tenant.findOne({
      _id: toObjectId(id),
      organizationId: toObjectId(organizationId),
    })
      .session(session ?? null)
      .populate("flat", FLAT_SUMMARY)
      .lean<TenantRecord>();
  },

  async list(
    organizationId: string,
    filter: TenantListFilter,
    skip: number,
    limit: number,
  ) {
    const query: Record<string, unknown> = {
      organizationId: toObjectId(organizationId),
      isActive: filter.isActive,
    };
    if (filter.rentDue) query.pendingBalance = { $gt: 0 };
    const [items, total] = await Promise.all([
      Tenant.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("flat", FLAT_SUMMARY)
        .lean<TenantRecord[]>(),
      Tenant.countDocuments(query),
    ]);
    return { items, total };
  },

  async create(data: Partial<TenantDoc>, session?: ClientSession) {
    const [doc] = await Tenant.create([data], { session: session ?? null });
    if (!doc) throw new Error("Tenant insert returned no document");
    return doc.toObject<TenantDoc>();
  },

  update(
    id: string | Types.ObjectId,
    organizationId: string,
    update: UpdateQuery<TenantDoc> | PipelineStage[],
    session?: ClientSession,
    extraFilter: Record<string, unknown> = {},
  ) {
    return Tenant.findOneAndUpdate(
      {
        _id: toObjectId(id),
        organizationId: toObjectId(organizationId),
        ...extraFilter,
      },
      update as UpdateQuery<TenantDoc>,
      {
        returnDocument: "after",
        runValidators: true,
        session: session ?? null,
        // Aggregation-pipeline updates compute new values server-side atomically.
        ...(Array.isArray(update) ? { updatePipeline: true } : {}),
      },
    )
      .populate("flat", FLAT_SUMMARY)
      .lean<TenantRecord>();
  },

  listForFlat(flatId: string, organizationId: string, sort: 1 | -1) {
    return Tenant.find({
      organizationId: toObjectId(organizationId),
      flat: toObjectId(flatId),
    })
      .sort({ dateOfRenting: sort })
      .limit(500)
      .lean<TenantDoc[]>();
  },

  findActiveByContactHash(contactNumberHash: string) {
    return Tenant.findOne({ contactNumberHash, isActive: true })
      .sort({ updatedAt: -1 })
      .populate("flat", FLAT_SUMMARY)
      .lean<TenantRecord>();
  },

  findByKycTokenHash(tokenHash: string, organizationId: string | null) {
    return Tenant.findOne({
      kycTokenHash: tokenHash,
      ...(organizationId ? { organizationId: toObjectId(organizationId) } : {}),
    })
      .populate("flat", FLAT_SUMMARY)
      .lean<TenantRecord>();
  },
};

export const rentRepository = {
  findByIdempotencyKey(organizationId: string, key: string) {
    return RentHistory.findOne({
      organizationId: toObjectId(organizationId),
      idempotencyKey: key,
    }).lean<RentHistoryDoc>();
  },

  async create(data: Partial<RentHistoryDoc>, session?: ClientSession) {
    const [doc] = await RentHistory.create([data], {
      session: session ?? null,
    });
    if (!doc) throw new Error("Rent insert returned no document");
    return doc.toObject<RentHistoryDoc>();
  },

  async listForTenant(
    tenantId: string,
    organizationId: string,
    skip: number,
    limit: number,
  ) {
    const filter = {
      organizationId: toObjectId(organizationId),
      tenant: toObjectId(tenantId),
    };
    const [items, total] = await Promise.all([
      RentHistory.find(filter)
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean<RentHistoryDoc[]>(),
      RentHistory.countDocuments(filter),
    ]);
    return { items, total };
  },

  latestForTenant(tenantId: Types.ObjectId, organizationId: Types.ObjectId) {
    return RentHistory.findOne({ organizationId, tenant: tenantId })
      .sort({ paymentDate: -1 })
      .lean<RentHistoryDoc>();
  },

  revenueByPeriodForFlat(flatId: string, organizationId: string) {
    return RentHistory.aggregate<{ _id: number; totalPaid: number }>([
      {
        $match: {
          organizationId: toObjectId(organizationId),
          flat: toObjectId(flatId),
        },
      },
      { $group: { _id: "$period", totalPaid: { $sum: "$amountPaid" } } },
      { $sort: { _id: 1 } },
    ]);
  },
};
