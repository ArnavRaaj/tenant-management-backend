import Floor from "../models/Floor";

export const getAllFloorsRepo = async () => {
  return await Floor.find({ isActive: true }).sort({ order: 1, floorNumber: 1 });
};

export const getFloorByNumberRepo = async (floorNumber: number) => {
  return await Floor.findOne({ floorNumber });
};

export const createFloorRepo = async (data: {
  floorNumber: number;
  name: string;
  order?: number;
  isActive?: boolean;
}) => {
  return await Floor.create({
    ...data,
    order: data.order !== undefined ? data.order : data.floorNumber,
  });
};

export const countFloorsRepo = async () => {
  return await Floor.countDocuments();
};

export const seedDefaultFloorsRepo = async (
  floors: { floorNumber: number; name: string; order: number }[],
) => {
  return await Floor.insertMany(floors);
};
