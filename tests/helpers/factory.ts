import crypto from "crypto";
import request from "supertest";
import { app } from "../../src/app";
import { signAccessToken } from "../../src/core/security/jwt";
import { hashPassword } from "../../src/core/security/password";
import {
  organizationIdOf,
  User,
  type UserDoc,
} from "../../src/modules/users/user.model";

export const api = () => request(app);

export const PASSWORD = "Str0ng@Pass!";

export interface TestUser {
  user: UserDoc;
  token: string;
  orgId: string;
  auth: { Authorization: string };
}

const tokenFor = (user: UserDoc): TestUser => {
  const token = signAccessToken({
    sub: user._id.toHexString(),
    org: organizationIdOf(user),
    role: user.role,
    tv: user.tokenVersion,
  });
  return {
    user,
    token,
    orgId: organizationIdOf(user),
    auth: { Authorization: `Bearer ${token}` },
  };
};

const uniqueEmail = (prefix: string) =>
  `${prefix}.${crypto.randomBytes(4).toString("hex")}@example.com`;

export const createSuperadmin = async (
  overrides: Partial<UserDoc> = {},
): Promise<TestUser> => {
  const doc = await User.create({
    name: "Owner One",
    email: uniqueEmail("owner"),
    password: await hashPassword(PASSWORD),
    role: "superadmin",
    isVerified: true,
    ...overrides,
  });
  return tokenFor(doc.toObject());
};

export const createAdmin = async (
  org: TestUser,
  overrides: Partial<UserDoc> = {},
): Promise<TestUser> => {
  const doc = await User.create({
    name: "Admin User",
    email: uniqueEmail("admin"),
    password: await hashPassword(PASSWORD),
    role: "admin",
    superadminId: org.user._id,
    isVerified: true,
    ...overrides,
  });
  return tokenFor(doc.toObject());
};

let flatCounter = 100;

export const createFlat = async (
  owner: TestUser,
  overrides: Record<string, unknown> = {},
) => {
  const res = await api()
    .post("/api/flats")
    .set(owner.auth)
    .send({
      flatNumber: String(++flatCounter),
      floor: 1,
      buildingName: "Tower A",
      ...overrides,
    });
  if (res.status !== 201)
    throw new Error(`createFlat failed: ${JSON.stringify(res.body)}`);
  return res.body.data as { _id: string; flatNumber: string; floor: number };
};

let phoneCounter = 0;
export const uniquePhone = () =>
  `98${String(76543210 + ++phoneCounter).padStart(8, "0")}`;

export const tenantPayload = (
  flatId: string,
  overrides: Record<string, unknown> = {},
) => ({
  flatId,
  name: "Rahul Sharma",
  contactNumber: uniquePhone(),
  securityDeposit: 30000,
  monthlyRent: 15000,
  aadharNumber: "234567890123",
  gender: "male",
  ...overrides,
});

export const assignTenant = async (
  owner: TestUser,
  flatId: string,
  overrides: Record<string, unknown> = {},
) => {
  const res = await api()
    .post("/api/tenants")
    .set(owner.auth)
    .send(tenantPayload(flatId, overrides));
  if (res.status !== 201)
    throw new Error(`assignTenant failed: ${JSON.stringify(res.body)}`);
  return res.body.data as {
    _id: string;
    kycLink: string;
    contactNumber: string;
  };
};
