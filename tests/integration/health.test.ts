import { describe, expect, it } from "vitest";
import { useTestDatabase } from "../helpers/db";
import { api } from "../helpers/factory";

describe("Health, tracing and the response envelope", () => {
  useTestDatabase();

  it("serves liveness at /api/health", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(res.body).toHaveProperty("uptime");
  });

  it("reports readiness including pending migrations", async () => {
    const res = await api().get("/api/health/ready");
    // A fresh test database has not been migrated → not ready (503).
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toBe(true);
    expect(Array.isArray(res.body.checks.migrations)).toBe(true);
  });

  it("attaches a generated X-Request-Id and preserves a well-formed incoming one", async () => {
    const generated = await api().get("/api/health");
    expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const custom = await api()
      .get("/api/health")
      .set("X-Request-Id", "trace-abc-123");
    expect(custom.headers["x-request-id"]).toBe("trace-abc-123");
  });

  it("replaces a malicious incoming request id", async () => {
    const res = await api()
      .get("/api/health")
      .set("X-Request-Id", "<script>alert(1)</script>");
    expect(res.headers["x-request-id"]).not.toContain("<");
  });

  it("returns a JSON 404 envelope for unknown routes", async () => {
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "ROUTE_NOT_FOUND" },
    });
    expect(res.body.requestId).toBeDefined();
  });

  it("sets security headers and hides the framework", async () => {
    const res = await api().get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rejects NoSQL operator injection in request bodies", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: { $ne: null }, password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 with field details for malformed JSON-schema input", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      res.body.error.details.map((d: { field: string }) => d.field),
    ).toEqual(expect.arrayContaining(["body.email", "body.password"]));
  });

  it("rejects unauthenticated access to protected routes with 401", async () => {
    for (const path of [
      "/api/flats",
      "/api/tenants",
      "/api/floors",
      "/api/maintenance/tickets",
    ]) {
      const res = await api().get(path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });
});
