import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server";

describe("Dynamic Floors API & RBAC Guard", () => {
  it("should guard /api/floors and reject unauthenticated requests with 401 Unauthorized", async () => {
    const res = await request(app).get("/api/floors");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Not authorized");
  });
});
