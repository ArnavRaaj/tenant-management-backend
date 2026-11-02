import { describe, expect, it, vi } from "vitest";
import {
  drainInMemoryJobs,
  enqueueJob,
  registerJobHandler,
} from "../../src/core/queue/jobQueue";
import { createLimiter } from "../../src/core/middleware/rateLimit";
import { detectFileKind } from "../../src/core/middleware/upload";
import { toPaise, toRupees } from "../../src/core/utils/money";
import {
  currentPeriod,
  monthNumberFromName,
  periodLabel,
  toPeriod,
  zonedParts,
} from "../../src/core/utils/period";
import {
  escapeHtml,
  escapeRegex,
  maskAadhaar,
  normalizePhone,
} from "../../src/core/utils/text";
import { diffChanges, redact } from "../../src/modules/audit/audit.redaction";
import {
  buildAssetPath,
  parseAsset,
  serializeAsset,
} from "../../src/modules/storage/storage.service";
import {
  classifyIssueRuleBased,
  looksLikeMaintenance,
} from "../../src/modules/maintenance/aiClassifier";
import { classifyPayment } from "../../src/modules/tenants/rent.service";

declare module "../../src/core/queue/jobQueue" {
  interface JobRegistry {
    "test.flaky": { id: number };
  }
}

describe("Background job queue (in-process fallback)", () => {
  it("retries a failing job with backoff until it succeeds", async () => {
    let calls = 0;
    registerJobHandler("test.flaky", async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
    });
    await enqueueJob("test.flaky", { id: 1 });
    await drainInMemoryJobs();
    expect(calls).toBe(3);
  });

  it("gives up after the attempt limit", async () => {
    const handler = vi.fn(async () => {
      throw new Error("always fails");
    });
    registerJobHandler("test.flaky", handler);
    await enqueueJob("test.flaky", { id: 2 }, { attempts: 2 });
    await drainInMemoryJobs();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("Rate limiter", () => {
  it("blocks after the configured number of points", async () => {
    const limiter = createLimiter({
      name: "unit-test",
      points: 2,
      durationSeconds: 60,
    });
    await limiter.consume("k");
    await limiter.consume("k");
    await expect(limiter.consume("k")).rejects.toMatchObject({
      statusCode: 429,
    });
    await limiter.reset("k");
    await expect(limiter.consume("k")).resolves.toBeUndefined();
  });
});

describe("Upload content sniffing", () => {
  it("identifies real file types from magic bytes", () => {
    expect(detectFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(
      detectFileKind(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("png");
    expect(detectFileKind(Buffer.from("RIFF0000WEBP"))).toBe("webp");
    expect(detectFileKind(Buffer.from("%PDF-1.7"))).toBe("pdf");
    expect(detectFileKind(Buffer.from("<html>"))).toBeNull();
  });
});

describe("Storage paths", () => {
  it("builds stable, PII-free object paths and round-trips asset references", () => {
    const path = buildAssetPath({
      organizationId: "o".repeat(24),
      entity: "tenants",
      entityId: "t".repeat(24),
      category: "kyc",
      baseName: "aadhaar",
      timestamp: 1,
    });
    expect(path).toBe(
      `test/orgs/${"o".repeat(24)}/tenants/${"t".repeat(24)}/kyc/aadhaar_1`,
    );
    expect(
      parseAsset(serializeAsset({ publicId: path, format: "png" })),
    ).toEqual({ publicId: path, format: "png" });
    expect(parseAsset("https://res.cloudinary.com/x.png")).toEqual({
      legacyUrl: "https://res.cloudinary.com/x.png",
    });
  });
});

describe("Money and periods", () => {
  it("converts rupees ↔ paise without float drift", () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(toPaise(0.3));
    expect(toRupees(1_500_050)).toBe(15000.5);
  });

  it("uses IST for the current month, not the server's locale/timezone", () => {
    // 2026-01-31 20:00 UTC is already 1 February in India.
    expect(zonedParts(new Date("2026-01-31T20:00:00Z"))).toEqual({
      year: 2026,
      month: 2,
      day: 1,
    });
    expect(currentPeriod(new Date("2026-01-31T20:00:00Z"))).toBe(202602);
  });

  it("parses and formats periods", () => {
    expect(monthNumberFromName("sept")).toBe(9);
    expect(monthNumberFromName("Smarch")).toBeNull();
    expect(toPeriod(2026, 11)).toBe(202611);
    expect(periodLabel(202611)).toBe("November 2026");
  });

  it("classifies payment punctuality relative to the rent period", () => {
    expect(classifyPayment(new Date("2026-03-03T06:00:00Z"), 202603)).toBe(
      "ON_TIME",
    );
    expect(classifyPayment(new Date("2026-03-10T06:00:00Z"), 202603)).toBe(
      "MID_MONTH",
    );
    expect(classifyPayment(new Date("2026-03-25T06:00:00Z"), 202603)).toBe(
      "CHRONIC_LATE",
    );
    expect(classifyPayment(new Date("2026-04-02T06:00:00Z"), 202603)).toBe(
      "CHRONIC_LATE",
    );
    expect(classifyPayment(new Date("2026-02-27T06:00:00Z"), 202603)).toBe(
      "ON_TIME",
    );
  });
});

describe("Text helpers", () => {
  it("escapes HTML and RegExp metacharacters", () => {
    expect(escapeHtml(`<img src=x onerror="a">`)).toBe(
      "&lt;img src=x onerror=&quot;a&quot;&gt;",
    );
    expect(new RegExp(escapeRegex("a.b*")).test("aXb")).toBe(false);
  });

  it("normalises phones and masks Aadhaar", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(maskAadhaar("2345 6789 0123")).toBe("XXXX-XXXX-0123");
  });
});

describe("Audit redaction and diffs", () => {
  it("redacts sensitive keys at any depth", () => {
    const out = redact({
      a: { contactNumber: "98", nested: { password: "p", ok: 1 } },
      aadharNumber: "1",
    });
    expect(out).toEqual({
      a: {
        contactNumber: "[REDACTED]",
        nested: { password: "[REDACTED]", ok: 1 },
      },
      aadharNumber: "[REDACTED]",
    });
  });

  it("diffs only changed fields and hides sensitive values", () => {
    expect(
      diffChanges(
        { rent: 1, name: "A", contactNumber: "h1" },
        { rent: 2, name: "A", contactNumber: "h2" },
      ),
    ).toEqual([
      { field: "rent", from: 1, to: 2 },
      { field: "contactNumber", from: "[REDACTED]", to: "[REDACTED]" },
    ]);
  });
});

describe("Maintenance classifier", () => {
  it.each([
    [
      "Bathroom me flush leak ho raha hai aur paani beh raha hai",
      "PLUMBING",
      ["HIGH", "EMERGENCY"],
    ],
    [
      "Main MCB me spark hua aur short circuit hai",
      "ELECTRICAL",
      ["EMERGENCY"],
    ],
    ["Bedroom door lock and handle broken", "CARPENTRY", ["MEDIUM"]],
    ["AC not cooling since morning", "APPLIANCE", ["MEDIUM"]],
  ])("%j → %s", (text, category, urgencies) => {
    const res = classifyIssueRuleBased(text);
    expect(res.category).toBe(category);
    expect(urgencies).toContain(res.urgency);
  });

  it("uses word boundaries (no 'ac' in 'account', no 'current' in 'currently')", () => {
    expect(looksLikeMaintenance("Account details bhejo")).toBe(false);
    expect(looksLikeMaintenance("I am currently outside")).toBe(false);
    expect(looksLikeMaintenance("Pankha kharab hai")).toBe(true);
  });
});
