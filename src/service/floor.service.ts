import { Request } from "express";
import {
  getAllFloorsRepo,
  getFloorByNumberRepo,
  createFloorRepo,
  countFloorsRepo,
  seedDefaultFloorsRepo,
} from "../repository/floor.repository";
import { ConflictError } from "../utils/AppError";

export const DEFAULT_FLOORS = [
  { floorNumber: 0, name: "Ground Floor", order: 0 },
  { floorNumber: 1, name: "1st Floor", order: 1 },
  { floorNumber: 2, name: "2nd Floor", order: 2 },
  { floorNumber: 3, name: "3rd Floor", order: 3 },
  { floorNumber: 4, name: "4th Floor", order: 4 },
  { floorNumber: 5, name: "5th Floor", order: 5 },
  { floorNumber: 6, name: "6th Floor", order: 6 },
  { floorNumber: 7, name: "7th Floor", order: 7 },
  { floorNumber: 8, name: "8th Floor", order: 8 },
  { floorNumber: 9, name: "9th Floor", order: 9 },
  { floorNumber: 10, name: "10th Floor", order: 10 },
];

/**
 * Ensures floors collection is seeded with default floors (0 to 10) if empty
 */
export const seedFloorsIfEmpty = async () => {
  try {
    const count = await countFloorsRepo();
    if (count === 0) {
      await seedDefaultFloorsRepo(DEFAULT_FLOORS);
      console.log("🏢 Seeded default floors (Ground to 10th Floor) into database");
    }
  } catch (err: any) {
    console.error("⚠️ Failed to auto-seed floors:", err.message);
  }
};

/**
 * Returns all active floors sorted by order/floor number
 */
export const getFloorsService = async () => {
  let floors = await getAllFloorsRepo();
  if (!floors || floors.length === 0) {
    await seedFloorsIfEmpty();
    floors = await getAllFloorsRepo();
  }
  return floors;
};

/**
 * Creates a new floor dynamically without requiring code redeployments
 */
export const createFloorService = async (req: Request) => {
  const { floorNumber, name, order, isActive } = req.body;

  const existing = await getFloorByNumberRepo(floorNumber);
  if (existing) {
    throw new ConflictError(`Floor number ${floorNumber} already exists in the database`);
  }

  const newFloor = await createFloorRepo({
    floorNumber,
    name,
    order: order !== undefined ? order : floorNumber,
    isActive: isActive !== undefined ? isActive : true,
  });

  return newFloor;
};
