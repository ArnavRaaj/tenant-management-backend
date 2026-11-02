import { CacheKeys, cacheDel, cached } from "../../core/cache/cache";
import { toObjectId } from "../../core/db/objectId";
import { ConflictError, ErrorCode } from "../../core/errors/AppError";
import { recordAuditChange } from "../../core/requestContext";
import { DEFAULT_FLOORS, Floor, type FloorDoc } from "./floor.model";

export interface FloorDto {
  _id: string;
  floorNumber: number;
  name: string;
  order: number;
  isActive: boolean;
}

const toDto = (f: FloorDoc): FloorDto => ({
  _id: f._id.toHexString(),
  floorNumber: f.floorNumber,
  name: f.name,
  order: f.order,
  isActive: f.isActive,
});

const FLOORS_TTL_SECONDS = 300;

/** Seeds Ground–10th floors for an organisation the first time it is needed. */
const seedDefaults = async (organizationId: string): Promise<void> => {
  const org = toObjectId(organizationId);
  await Floor.bulkWrite(
    DEFAULT_FLOORS.map((f) => ({
      updateOne: {
        filter: { organizationId: org, floorNumber: f.floorNumber },
        update: { $setOnInsert: { ...f, organizationId: org, isActive: true } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
};

export const listFloors = (organizationId: string): Promise<FloorDto[]> =>
  cached(CacheKeys.floors(organizationId), FLOORS_TTL_SECONDS, async () => {
    const query = () =>
      Floor.find({ organizationId: toObjectId(organizationId), isActive: true })
        .sort({ order: 1, floorNumber: 1 })
        .lean<FloorDoc[]>();
    let floors = await query();
    if (floors.length === 0) {
      await seedDefaults(organizationId);
      floors = await query();
    }
    return floors.map(toDto);
  });

export const getFloorNameMap = async (
  organizationId: string,
): Promise<Map<number, string>> =>
  new Map(
    (await listFloors(organizationId)).map((f) => [f.floorNumber, f.name]),
  );

export const createFloor = async (
  organizationId: string,
  input: {
    floorNumber: number;
    name: string;
    order?: number;
    isActive?: boolean;
  },
): Promise<FloorDto> => {
  const org = toObjectId(organizationId);
  if (
    await Floor.exists({ organizationId: org, floorNumber: input.floorNumber })
  ) {
    throw new ConflictError(
      `Floor number ${input.floorNumber} already exists`,
      ErrorCode.DUPLICATE_RESOURCE,
    );
  }
  const floor = await Floor.create({
    organizationId: org,
    floorNumber: input.floorNumber,
    name: input.name,
    order: input.order ?? input.floorNumber,
    isActive: input.isActive ?? true,
  });
  await cacheDel(CacheKeys.floors(organizationId));
  const dto = toDto(floor.toObject());
  recordAuditChange({ resourceId: dto._id, after: { ...dto } });
  return dto;
};
