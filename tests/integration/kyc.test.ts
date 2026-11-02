import { describe, expect, it } from "vitest";
import { Tenant } from "../../src/modules/tenants/tenant.model";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createFlat,
  createSuperadmin,
} from "../helpers/factory";

const tokenOf = (link: string) => link.split("/kyc/")[1] as string;

describe("Aadhaar e-KYC (public link flow)", () => {
  useTestDatabase();

  const setup = async () => {
    const owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id, { aadharNumber: "" });
    return { owner, tenant, token: tokenOf(tenant.kycLink) };
  };

  it("rejects malformed tokens (400) and unknown tokens (404)", async () => {
    expect((await api().get("/api/kyc/info/short")).status).toBe(400);
    expect((await api().get(`/api/kyc/info/${"a".repeat(88)}`)).status).toBe(
      404,
    );
  });

  it("stores only a hash of the token", async () => {
    const { tenant, token } = await setup();
    const raw = await Tenant.findById(tenant._id).lean();
    expect(JSON.stringify(raw)).not.toContain(token);
  });

  it("completes verification: info → OTP → submit → VERIFIED, then the link is dead", async () => {
    const { owner, tenant, token } = await setup();

    const info = await api().get(`/api/kyc/info/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.data).toMatchObject({
      tenantName: "Rahul Sharma",
      kycStatus: "PENDING",
    });
    expect(info.body.data).not.toHaveProperty("contactNumber");

    const otp = await api()
      .post("/api/kyc/generate-otp")
      .send({ token, aadharNumber: "2345 6789 0123" });
    expect(otp.status).toBe(200);
    expect(otp.body.data.clientId).toBeDefined();

    const submit = await api()
      .post("/api/kyc/submit-otp")
      .send({ token, otp: "123456" });
    expect(submit.status).toBe(200);
    expect(submit.body.data.verifiedData.maskedAadhar).toBe("XXXX-XXXX-0123");

    const stored = await Tenant.findById(tenant._id).lean();
    expect(stored?.kycStatus).toBe("VERIFIED");
    expect(stored?.kycTokenHash).toBeNull();

    expect((await api().get(`/api/kyc/info/${token}`)).status).toBe(404);
    const link = await api()
      .get(`/api/tenants/${tenant._id}/kyc-link`)
      .set(owner.auth);
    expect(link.body.data.kycStatus).toBe("VERIFIED");
  });

  it("requires an OTP request from the same link before submission", async () => {
    const { token } = await setup();
    const res = await api()
      .post("/api/kyc/submit-otp")
      .send({ token, otp: "123456" });
    expect(res.status).toBe(422);
  });

  it("rejects expired links (422)", async () => {
    const { tenant, token } = await setup();
    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { kycTokenExpires: new Date(Date.now() - 1000) } },
    );
    const res = await api().get(`/api/kyc/info/${token}`);
    expect(res.status).toBe(422);
  });

  it("limits OTP generation per link (cost control) → 429", async () => {
    const { token } = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (
          await api()
            .post("/api/kyc/generate-otp")
            .send({ token, aadharNumber: "234567890123" })
        ).status,
      );
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
