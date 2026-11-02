import { toObjectId } from "../../core/db/objectId";
import { Address } from "./address.model";

export const findAddressInOrg = (addressId: string, organizationId: string) =>
  Address.exists({
    _id: toObjectId(addressId),
    organizationId: toObjectId(organizationId),
  });
