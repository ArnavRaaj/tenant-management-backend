import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { Flat } from "../../src/modules/flats/flat.model";
import { Tenant } from "../../src/modules/tenants/tenant.model";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createFlat,
  createSuperadmin,
  tenantPayload,
  type TestUser,
} from "../helpers/factory";

describe("Tenant lifecycle (assign → update → change → vacate)", () => {
  useTestDatabase();
  let owner: TestUser;

  beforeEach(async () => {
    owner = await createSuperadmin();
  });

  it("assigns a tenant to a vacant flat (201) and occupies the flat", async () => {
    const flat = await createFlat(owner);
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .send(tenantPayload(flat._id));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.kycLink).toMatch(/\/kyc\/[0-9a-f]{88}$/);
    expect(res.body.data.aadharNumber).toBe("XXXX-XXXX-0123");
    expect(res.body.data.monthlyRent).toBe(15000);

    const stored = await Flat.findById(flat._id).lean();
    expect(String(stored?.currentTenant)).toBe(res.body.data._id);
  });

  it("stores PII encrypted, never the full Aadhaar, and money in paise", async () => {
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id, {
      contactNumber: "+91 98765 11111",
    });
    const raw = await mongoose.connection.db!.collection("tenants").findOne({
      _id: new mongoose.Types.ObjectId(tenant._id),
    });

    expect(raw?.contactNumber).toMatch(/^v2:/);
    expect(raw?.contactNumberHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(raw)).not.toContain("234567890123");
    expect(JSON.stringify(raw)).not.toContain("9876511111");
    expect(raw?.monthlyRent).toBe(1_500_000);
    expect(tenant.contactNumber).toBe("9876511111");
  });

  it("refuses to assign a second tenant to an occupied flat (409)", async () => {
    const flat = await createFlat(owner);
    await assignTenant(owner, flat._id);
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .send(tenantPayload(flat._id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("allows exactly one of two concurrent assignments to the same flat", async () => {
    const flat = await createFlat(owner);
    const [a, b] = await Promise.all([
      api().post("/api/tenants").set(owner.auth).send(tenantPayload(flat._id)),
      api().post("/api/tenants").set(owner.auth).send(tenantPayload(flat._id)),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await Tenant.countDocuments({ flat: flat._id })).toBe(1);
  });

  it("returns 404 for a flat that does not exist", async () => {
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .send(tenantPayload(new mongoose.Types.ObjectId().toHexString()));
    expect(res.status).toBe(404);
  });

  it("validates tenant input (contact number, Aadhaar, money)", async () => {
    const flat = await createFlat(owner);
    const res = await api()
      .post("/api/tenants")
      .set(owner.auth)
      .send(
        tenantPayload(flat._id, {
          contactNumber: "12345",
          aadharNumber: "12",
          monthlyRent: -5,
        }),
      );
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map(
      (d: { field: string }) => d.field,
    );
    expect(fields).toEqual(
      expect.arrayContaining([
        "body.contactNumber",
        "body.aadharNumber",
        "body.monthlyRent",
      ]),
    );
  });

  it("vacates a tenant (200), frees the flat, and rejects a second vacate (409)", async () => {
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id);

    const first = await api()
      .post(`/api/tenants/${tenant._id}/vacate`)
      .set(owner.auth);
    expect(first.status).toBe(200);
    expect((await Flat.findById(flat._id).lean())?.currentTenant).toBeNull();

    const second = await api()
      .post(`/api/tenants/${tenant._id}/vacate`)
      .set(owner.auth);
    expect(second.status).toBe(409);
  });

  it("vacating a past tenant never evicts the flat's new tenant", async () => {
    const flat = await createFlat(owner);
    const oldTenant = await assignTenant(owner, flat._id);
    const changed = await api()
      .post(`/api/tenants/${oldTenant._id}/change`)
      .set(owner.auth)
      .send({
        ...tenantPayload(flat._id),
        flatId: undefined,
        name: "New Tenant",
      });
    expect(changed.status).toBe(201);

    const res = await api()
      .post(`/api/tenants/${oldTenant._id}/vacate`)
      .set(owner.auth);
    expect(res.status).toBe(409);
    const stored = await Flat.findById(flat._id).lean();
    expect(String(stored?.currentTenant)).toBe(changed.body.data._id);
  });

  it("change tenant archives the old tenant and assigns the new one atomically", async () => {
    const flat = await createFlat(owner);
    const oldTenant = await assignTenant(owner, flat._id);
    const { flatId: _ignored, ...body } = tenantPayload(flat._id, {
      name: "Priya Verma",
    });
    const res = await api()
      .post(`/api/tenants/${oldTenant._id}/change`)
      .set(owner.auth)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Priya Verma");
    const old = await Tenant.findById(oldTenant._id).lean();
    expect(old?.isActive).toBe(false);
    expect(old?.vacatedDate).toBeInstanceOf(Date);
  });

  it("update ignores injected fields (mass assignment) and accepts multipart-style blanks", async () => {
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id);
    const otherOrg = new mongoose.Types.ObjectId().toHexString();

    const res = await api()
      .put(`/api/tenants/${tenant._id}`)
      .set(owner.auth)
      .send({
        name: "Rahul S.",
        age: "", // blank form field
        gender: "MALE", // KYC providers return upper-case
        aadharNumber: "XXXX-XXXX-0123", // masked value echoed back by the form
        organizationId: otherOrg,
        kycStatus: "VERIFIED",
        isActive: false,
      });

    expect(res.status).toBe(200);
    const stored = await Tenant.findById(tenant._id).lean();
    expect(stored?.name).toBe("Rahul S.");
    expect(String(stored?.organizationId)).toBe(owner.orgId);
    expect(stored?.kycStatus).toBe("PENDING");
    expect(stored?.isActive).toBe(true);
    expect(stored?.gender).toBe("male");
  });

  it("lists tenants with pagination meta and filters past tenants", async () => {
    const flatA = await createFlat(owner);
    const flatB = await createFlat(owner);
    const t1 = await assignTenant(owner, flatA._id);
    await assignTenant(owner, flatB._id);
    await api().post(`/api/tenants/${t1._id}/vacate`).set(owner.auth);

    const active = await api().get("/api/tenants?limit=1").set(owner.auth);
    expect(active.status).toBe(200);
    expect(active.body.data).toHaveLength(1);
    expect(active.body.meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
      hasNextPage: false,
    });

    const past = await api().get("/api/tenants?status=past").set(owner.auth);
    expect(past.body.data).toHaveLength(1);
    expect(past.body.data[0].isActive).toBe(false);
  });

  it("caps page size to prevent unbounded queries", async () => {
    const res = await api().get("/api/tenants?limit=100000").set(owner.auth);
    expect(res.status).toBe(400);
  });

  it("returns the KYC link with a decrypted contact number", async () => {
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id, {
      contactNumber: "9811122233",
    });
    const res = await api()
      .get(`/api/tenants/${tenant._id}/kyc-link`)
      .set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.contactNumber).toBe("9811122233");
    expect(res.body.data.kycLink).toBe(tenant.kycLink);
  });
});

describe("Flats", () => {
  useTestDatabase();

  it("enforces per-organisation uniqueness of flat numbers (409 within org, OK across orgs)", async () => {
    const a = await createSuperadmin();
    const b = await createSuperadmin();
    await createFlat(a, { flatNumber: "101" });

    const dup = await api()
      .post("/api/flats")
      .set(a.auth)
      .send({ flatNumber: "101", floor: 1, buildingName: "Tower A" });
    expect(dup.status).toBe(409);

    const otherOrg = await api()
      .post("/api/flats")
      .set(b.auth)
      .send({ flatNumber: "101", floor: 1, buildingName: "Tower A" });
    expect(otherOrg.status).toBe(201);
  });

  it("deletes a vacant flat (204) but not an occupied one (409)", async () => {
    const owner = await createSuperadmin();
    const vacant = await createFlat(owner);
    const occupied = await createFlat(owner);
    await assignTenant(owner, occupied._id);

    expect(
      (await api().delete(`/api/flats/${occupied._id}`).set(owner.auth)).status,
    ).toBe(409);
    const del = await api().delete(`/api/flats/${vacant._id}`).set(owner.auth);
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
  });

  it("rejects an address belonging to another organisation", async () => {
    const a = await createSuperadmin();
    const b = await createSuperadmin();
    const addr = await api()
      .post("/api/addresses")
      .set(b.auth)
      .send({
        addressLine1: "1 MG Road",
        city: "Pune",
        postalCode: "411001",
        state: "Maharashtra",
      });
    expect(addr.status).toBe(201);

    const res = await api()
      .post("/api/flats")
      .set(a.auth)
      .send({
        flatNumber: "9",
        floor: 0,
        buildingName: "X",
        address: addr.body.data._id,
      });
    expect(res.status).toBe(422);
  });

  it("serves per-organisation floors, seeded on first use", async () => {
    const owner = await createSuperadmin();
    const res = await api().get("/api/flats/meta/floors").set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(11);
    expect(res.body.data[0]).toMatchObject({
      floorNumber: 0,
      name: "Ground Floor",
    });

    const created = await api()
      .post("/api/floors")
      .set(owner.auth)
      .send({ floorNumber: 11, name: "Penthouse" });
    expect(created.status).toBe(201);
    const dup = await api()
      .post("/api/floors")
      .set(owner.auth)
      .send({ floorNumber: 11, name: "Again" });
    expect(dup.status).toBe(409);

    // Another org is unaffected by this org's custom floor.
    const other = await createSuperadmin();
    const otherFloors = await api().get("/api/floors").set(other.auth);
    expect(otherFloors.body.data).toHaveLength(11);
  });
});
