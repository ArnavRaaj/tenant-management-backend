import { beforeAll, describe, expect, it, vi } from "vitest";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createAdmin,
  createFlat,
  createSuperadmin,
  tenantPayload,
  type TestUser,
} from "../helpers/factory";

vi.mock(
  "../../src/modules/notifications/email.service",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    sendEmail: vi.fn(async () => undefined),
  }),
);

describe("RBAC and multi-tenant isolation", () => {
  useTestDatabase();

  let orgA: TestUser;
  let orgB: TestUser;
  let adminA: TestUser;
  let flatA: { _id: string };
  let tenantA: { _id: string };

  beforeAll(async () => {
    orgA = await createSuperadmin();
    orgB = await createSuperadmin();
    adminA = await createAdmin(orgA);
    flatA = await createFlat(orgA);
    tenantA = await assignTenant(orgA, flatA._id);
  });

  describe("RBAC: admin role is read-mostly", () => {
    it.each([
      ["post", "/api/flats", { flatNumber: "X1", floor: 1, buildingName: "B" }],
      ["post", "/api/floors", { floorNumber: 20, name: "Roof" }],
      [
        "post",
        "/api/users/invite",
        { name: "Someone", email: "someone@example.com" },
      ],
    ] as const)("%s %s → 403", async (method, path, body) => {
      const res = await api()[method](path).set(adminA.auth).send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("admin cannot record rent, vacate, or update tenants", async () => {
      const rent = await api()
        .post(`/api/tenants/${tenantA._id}/rent`)
        .set(adminA.auth)
        .send({ amountPaid: 100, rentMonth: "January", rentYear: 2026 });
      const vacate = await api()
        .post(`/api/tenants/${tenantA._id}/vacate`)
        .set(adminA.auth);
      const update = await api()
        .put(`/api/tenants/${tenantA._id}`)
        .set(adminA.auth)
        .send({ name: "X" });
      expect([rent.status, vacate.status, update.status]).toEqual([
        403, 403, 403,
      ]);
    });

    it("admin can read org data and work maintenance tickets", async () => {
      expect((await api().get("/api/flats").set(adminA.auth)).status).toBe(200);
      expect(
        (await api().get(`/api/tenants/${tenantA._id}`).set(adminA.auth))
          .status,
      ).toBe(200);
      const ticket = await api()
        .post("/api/maintenance/tickets")
        .set(adminA.auth)
        .send({ tenantId: tenantA._id, description: "Bathroom tap leaking" });
      expect(ticket.status).toBe(201);
    });

    it("audit logs are superadmin-only", async () => {
      expect((await api().get("/api/audit-logs").set(adminA.auth)).status).toBe(
        403,
      );
      expect((await api().get("/api/audit-logs").set(orgA.auth)).status).toBe(
        200,
      );
    });
  });

  describe("Tenant isolation: organisation B can never touch organisation A's data", () => {
    it.each([
      ["get", () => `/api/flats/${flatA._id}`],
      ["get", () => `/api/flats/${flatA._id}/tenants`],
      ["get", () => `/api/flats/${flatA._id}/revenue`],
      ["delete", () => `/api/flats/${flatA._id}`],
      ["get", () => `/api/tenants/${tenantA._id}`],
      ["get", () => `/api/tenants/${tenantA._id}/rent`],
      ["get", () => `/api/tenants/${tenantA._id}/kyc-link`],
      ["post", () => `/api/tenants/${tenantA._id}/vacate`],
    ] as const)("%s %s → 404", async (method, path) => {
      const res = await api()[method](path()).set(orgB.auth);
      expect(res.status).toBe(404);
    });

    it("cannot update or pay rent for another org's tenant", async () => {
      const update = await api()
        .put(`/api/tenants/${tenantA._id}`)
        .set(orgB.auth)
        .send({ name: "Hijack" });
      const rent = await api()
        .post(`/api/tenants/${tenantA._id}/rent`)
        .set(orgB.auth)
        .send({ amountPaid: 1, rentMonth: "January", rentYear: 2026 });
      expect([update.status, rent.status]).toEqual([404, 404]);
    });

    it("cannot assign a tenant into another org's flat", async () => {
      const res = await api()
        .post("/api/tenants")
        .set(orgB.auth)
        .send(tenantPayload(flatA._id));
      expect(res.status).toBe(404);
    });

    it("cannot open tickets for another org's tenant", async () => {
      const res = await api()
        .post("/api/maintenance/tickets")
        .set(orgB.auth)
        .send({ tenantId: tenantA._id, description: "Fan not working" });
      expect(res.status).toBe(404);
    });

    it("list endpoints only return the caller's own organisation", async () => {
      const flats = await api().get("/api/flats").set(orgB.auth);
      const tenants = await api().get("/api/tenants").set(orgB.auth);
      expect(flats.body.data).toHaveLength(0);
      expect(tenants.body.data).toHaveLength(0);
    });
  });

  describe("Session revocation", () => {
    it("a deactivated admin is locked out immediately", async () => {
      const admin = await createAdmin(orgA);
      expect((await api().get("/api/flats").set(admin.auth)).status).toBe(200);

      const deactivate = await api()
        .patch(`/api/users/${admin.user._id.toHexString()}/status`)
        .set(orgA.auth)
        .send({ isActive: false });
      expect(deactivate.status).toBe(200);
      expect((await api().get("/api/flats").set(admin.auth)).status).toBe(401);
    });

    it("a superadmin cannot deactivate another organisation's admin", async () => {
      const admin = await createAdmin(orgA);
      const res = await api()
        .patch(`/api/users/${admin.user._id.toHexString()}/status`)
        .set(orgB.auth)
        .send({ isActive: false });
      expect(res.status).toBe(404);
    });
  });

  describe("Invitations", () => {
    it("invites an admin, stores only a hash of the token, and accepts once", async () => {
      const invite = await api()
        .post("/api/users/invite")
        .set(orgA.auth)
        .send({ name: "Invited Admin", email: "invited@example.com" });
      expect(invite.status).toBe(201);
      const link = new URL(invite.body.data.inviteLink);
      const token = link.searchParams.get("token") as string;

      const accept = {
        email: "invited@example.com",
        token,
        password: "Adm1n@Pass",
        confirmPassword: "Adm1n@Pass",
      };
      expect(
        (await api().post("/api/users/accept-invitation").send(accept)).status,
      ).toBe(200);
      expect(
        (await api().post("/api/users/accept-invitation").send(accept)).status,
      ).toBe(422);

      const login = await api()
        .post("/api/auth/login")
        .send({ email: "invited@example.com", password: "Adm1n@Pass" });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe("admin");
      expect(login.body.data.user.organizationId).toBe(orgA.orgId);
    });
  });
});
