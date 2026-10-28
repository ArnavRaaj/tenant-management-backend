import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server";

describe("Health & Request Tracing Middleware", () => {
  it("should return 200 OK from root endpoint", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Tenant Management API is running...");
  });

  it("should return 200 OK with status and uptime from /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("should attach X-Request-Id correlation header to all responses", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.headers["x-request-id"]?.length).toBeGreaterThan(0);
  });

  it("should preserve incoming X-Request-Id if provided by caller", async () => {
    const customTraceId = "client-trace-123456";
    const res = await request(app)
      .get("/api/health")
      .set("X-Request-Id", customTraceId);
    expect(res.headers["x-request-id"]).toBe(customTraceId);
  });
});
