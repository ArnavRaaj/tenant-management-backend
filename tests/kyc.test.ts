import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server";

describe("Aadhaar e-KYC Verification Endpoints", () => {
  it("should reject kyc info lookup when token is not a 64-char hex string", async () => {
    const res = await request(app).get("/api/kyc/info/short-invalid-token");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 when generating OTP without a valid 12-digit Aadhaar", async () => {
    const dummyHexToken = "a".repeat(64);
    const res = await request(app)
      .post("/api/kyc/generate-otp")
      .send({
        token: dummyHexToken,
        aadharNumber: "12345", // invalid length
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("12 digits");
  });

  it("should return 400 when submitting OTP with invalid format", async () => {
    const dummyHexToken = "b".repeat(64);
    const res = await request(app)
      .post("/api/kyc/submit-otp")
      .send({
        token: dummyHexToken,
        otp: "123", // invalid length, needs 6 digits
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("6 digits");
  });
});

