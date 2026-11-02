import type { ClientSession, Types } from "mongoose";
import { toObjectId } from "../../core/db/objectId";
import { Flat, type FlatDoc } from "./flat.model";

/** Every query is scoped by organizationId — the tenant-isolation boundary. */
export const flatRepository = {
  findById(id: string, organizationId: string, session?: ClientSession) {
    return Flat.findOne({
      _id: toObjectId(id),
      organizationId: toObjectId(organizationId),
    })
      .session(session ?? null)
      .lean<FlatDoc>();
  },

  /**
   * Atomically assigns a tenant to a VACANT flat. Returns null if the flat
   * is missing or already occupied — this conditional update is what makes
   * two concurrent assignments to the same flat impossible.
   */
  claimForTenant(
    flatId: string,
    organizationId: string,
    tenantId: Types.ObjectId,
    session?: ClientSession,
  ) {
    return Flat.findOneAndUpdate(
      {
        _id: toObjectId(flatId),
        organizationId: toObjectId(organizationId),
        currentTenant: null,
      },
      { $set: { currentTenant: tenantId } },
      { returnDocument: "after", session: session ?? null },
    ).lean<FlatDoc>();
  },

  /** Clears the flat only if it is still occupied by this tenant. */
  async releaseTenant(
    flatId: Types.ObjectId,
    organizationId: string,
    tenantId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<boolean> {
    const res = await Flat.updateOne(
      {
        _id: flatId,
        organizationId: toObjectId(organizationId),
        currentTenant: tenantId,
      },
      { $set: { currentTenant: null } },
      session ? { session } : {},
    );
    return res.modifiedCount === 1;
  },

  /** Deletes only if vacant (atomic check-and-delete). */
  async deleteIfVacant(id: string, organizationId: string): Promise<boolean> {
    const res = await Flat.deleteOne({
      _id: toObjectId(id),
      organizationId: toObjectId(organizationId),
      currentTenant: null,
    });
    return res.deletedCount === 1;
  },

  distinctBuildings(organizationId: string) {
    return Flat.distinct("buildingName", {
      organizationId: toObjectId(organizationId),
    }) as unknown as Promise<string[]>;
  },
};
