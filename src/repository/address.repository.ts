const Address = require("../models/Address");

export const createAddressRepo = async (data: any, session?: any) => {
  const address = new Address(data);
  return await address.save({ session });
};

export const findAddressesByUserRepo = async (userId: string) => {
  return await Address.find({ createdBy: userId }).sort({ createdAt: -1 });
};

export const findAddressByIdRepo = async (id: string) => {
  return await Address.findById(id);
};
