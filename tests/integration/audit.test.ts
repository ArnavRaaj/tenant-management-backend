import { describe, expect, it } from "vitest";
import { AuditLog } from "../../src/modules/audit/auditLog.model";
import { flushAuditLogs } from "../../src/modules/audit/audit.writer";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createFlat,
  createSuperadmin,
  PASSWORD,
} from "../helpers/factory";

describe("Audit trail (who / when / what)", () => {
  useTestDatabase();

  it("records who did what to which record, with a field-level diff", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id);
    await api()
      .put(`/api/tenants/${tenant._id}`)
      .set(owner.auth)
      .send({ monthlyRent: 17000 });
    await flushAuditLogs();

    const update = await AuditLog.findOne({
      action: "TENANT_UPDATE",
      resourceId: tenant._id,
    }).lean();
    expect(update).toMatchObject({
      resource: "tenant",
      method: "PUT",
      path: "/api/tenants/:id",
      statusCode: 200,
      outcome: "SUCCESS",
      actor: { email: owner.user.email, role: "superadmin" },
    });
    expect(String(update?.organizationId)).toBe(owner.orgId);
    expect(update?.createdAt).toBeInstanceOf(Date);
    expect(update?.changes).toEqual([
      { field: "monthlyRent", from: 15000, to: 17000 },
    ]);
  });

  it("never stores personal data in plaintext (deep redaction)", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    await assignTenant(owner, flat._id, {
      contactNumber: "9123456780",
      aadharNumber: "345678901234",
    });
    await flushAuditLogs();

    const assign = await AuditLog.findOne({
      action: "TENANT_ASSIGN",
      organizationId: owner.user._id,
    }).lean();
    const serialised = JSON.stringify(assign);
    expect(serialised).not.toContain("9123456780");
    expect(serialised).not.toContain("345678901234");
    expect(serialised).toContain("[REDACTED]");
  });

  it("records failed attempts (outcome FAILURE) and never stores passwords", async () => {
    const owner = await createSuperadmin();
    await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: "Wrong@Pass1" });
    await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: PASSWORD });
    await flushAuditLogs();

    const logins = await AuditLog.find({
      action: "LOGIN",
      "request.body.email": owner.user.email,
    }).lean();
    expect(logins.map((l) => l.outcome).sort()).toEqual(["FAILURE", "SUCCESS"]);
    expect(JSON.stringify(logins)).not.toContain("Wrong@Pass1");
    expect(JSON.stringify(logins)).not.toContain(PASSWORD);
  });

  it("audits sensitive reads (viewing tenant PII)", async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id);
    await api().get(`/api/tenants/${tenant._id}`).set(owner.auth);
    await flushAuditLogs();
    expect(
      await AuditLog.countDocuments({
        action: "TENANT_VIEW",
        resourceId: tenant._id,
      }),
    ).toBe(1);
  });

  it("exposes an org-scoped, cursor-paginated audit log API", async () => {
    const owner = await createSuperadmin();
    for (let i = 0; i < 3; i++) await createFlat(owner);
    await flushAuditLogs();

    const page1 = await api()
      .get("/api/audit-logs?limit=2&action=FLAT_CREATE")
      .set(owner.auth);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.nextCursor).toMatch(/^[0-9a-f]{24}$/);

    const page2 = await api()
      .get(
        `/api/audit-logs?limit=2&action=FLAT_CREATE&cursor=${page1.body.meta.nextCursor}`,
      )
      .set(owner.auth);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.nextCursor).toBeNull();

    const other = await createSuperadmin();
    const otherLogs = await api()
      .get("/api/audit-logs?action=FLAT_CREATE")
      .set(other.auth);
    expect(otherLogs.body.data).toHaveLength(0);
  });
});
