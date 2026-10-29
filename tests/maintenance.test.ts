import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/server";
import { classifyIssueRuleBased } from "../src/service/maintenance/aiClassifier.service";

describe("Maintenance AI Classifier & Ticketing", () => {
  it("should classify plumbing flush leak accurately", () => {
    const analysis = classifyIssueRuleBased(
      "Bathroom me flush leak ho raha hai aur paani beh raha hai",
    );
    expect(analysis.category).toBe("PLUMBING");
    expect(["HIGH", "EMERGENCY"]).toContain(analysis.urgency);
    expect(analysis.title.toLowerCase()).toContain("plumbing");
  });

  it("should classify short circuit as emergency electrical", () => {
    const analysis = classifyIssueRuleBased(
      "Main MCB me spark hua aur short circuit hai",
    );
    expect(analysis.category).toBe("ELECTRICAL");
    expect(analysis.urgency).toBe("EMERGENCY");
  });

  it("should classify broken door lock as carpentry", () => {
    const analysis = classifyIssueRuleBased("Bedroom door lock and handle broken");
    expect(analysis.category).toBe("CARPENTRY");
  });

  it("should block unauthenticated access to maintenance endpoints", async () => {
    const res = await request(app).get("/api/maintenance/tickets");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

