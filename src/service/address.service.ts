import {
  createAddressRepo,
  findAddressesByUserRepo,
} from "../repository/address.repository";
import { AppError } from "../utils/AppError";

export const createAddressService = async (req: any) => {
  const { addressLine1, addressLine2, city, postalCode, state } = req.body;

  const address = await createAddressRepo({
    addressLine1,
    addressLine2: addressLine2 || "",
    city,
    postalCode,
    state,
    createdBy: req.user._id,
  });

  return address;
};

export const getAddressesService = async (req: any) => {
  const addresses = await findAddressesByUserRepo(req.user._id);
  return addresses;
};
