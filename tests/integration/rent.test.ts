import { beforeEach, describe, expect, it } from "vitest";
import { drainInMemoryJobs } from "../../src/core/queue/jobQueue";
import { currentPeriod, monthName } from "../../src/core/utils/period";
import { RentHistory } from "../../src/modules/tenants/rent.model";
import { Tenant } from "../../src/modules/tenants/tenant.model";
import { WhatsAppMessage } from "../../src/modules/whatsapp/whatsappMessage.model";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createFlat,
  createSuperadmin,
  type TestUser,
} from "../helpers/factory";

const now = currentPeriod();
const thisMonth = monthName(now % 100);
const thisYear = Math.floor(now / 100);

describe("Rent collection", () => {
  useTestDatabase();
  let owner: TestUser;
  let tenantId: string;

  beforeEach(async () => {
    owner = await createSuperadmin();
    const flat = await createFlat(owner, { floor: 3 });
    tenantId = (
      await assignTenant(owner, flat._id, {
        monthlyRent: 15000,
        pendingBalance: 0,
      })
    )._id;
  });

  const pay = (body: Record<string, unknown>, key?: string) => {
    const req = api().post(`/api/tenants/${tenantId}/rent`).set(owner.auth);
    if (key) req.set("Idempotency-Key", key);
    return req.send({
      rentMonth: thisMonth,
      rentYear: thisYear,
      paymentMode: "DIRECT_UPI",
      ...body,
    });
  };

  it("records a payment (201) with a sequential receipt and marks the month paid", async () => {
    const first = await pay({ amountPaid: 15000 });
    expect(first.status).toBe(201);
    expect(first.body.data.receiptNumber).toBe(`REC-${now}-000001`);
    expect(first.body.data.isCurrentMonthPaid).toBe(true);
    expect(first.body.data.remainingBalance).toBe(0);
    expect(first.body.data.receiptText).toContain("RENT RECEIPT");

    const second = await pay({ amountPaid: 100 });
    expect(second.body.data.receiptNumber).toBe(`REC-${now}-000002`);

    const list = await api().get("/api/tenants").set(owner.auth);
    expect(list.body.data[0].isCurrentMonthPaid).toBe(true);
    expect(list.body.data[0].lastPaidMonth).toBe(thisMonth);
  });

  it("stores amounts as integer paise and handles decimal rupees exactly", async () => {
    await pay({ amountPaid: 0.1 });
    await pay({ amountPaid: 0.2 });
    const records = await RentHistory.find({ tenant: tenantId }).lean();
    expect(records.map((r) => r.amountPaid).sort((a, b) => a - b)).toEqual([
      10, 20,
    ]);
    const tenant = await Tenant.findById(tenantId).lean();
    expect(Number.isInteger(tenant?.pendingBalance)).toBe(true);
  });

  it("a partial payment leaves the remainder pending; an overpayment becomes credit", async () => {
    const partial = await pay({ amountPaid: 10000 });
    expect(partial.body.data.remainingBalance).toBe(5000);

    const over = await pay({ amountPaid: 8000 });
    expect(over.body.data.remainingBalance).toBe(-3000); // credit carried forward
  });

  it("is idempotent: replaying the same Idempotency-Key returns the original receipt (200)", async () => {
    const first = await pay({ amountPaid: 15000 }, "pay-key-0001");
    const replay = await pay({ amountPaid: 15000 }, "pay-key-0001");
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.receiptNumber).toBe(first.body.data.receiptNumber);
    expect(await RentHistory.countDocuments({ tenant: tenantId })).toBe(1);
  });

  it("concurrent requests with one Idempotency-Key create exactly one payment", async () => {
    const results = await Promise.all([
      pay({ amountPaid: 15000 }, "pay-key-race1"),
      pay({ amountPaid: 15000 }, "pay-key-race1"),
      pay({ amountPaid: 15000 }, "pay-key-race1"),
    ]);
    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(await RentHistory.countDocuments({ tenant: tenantId })).toBe(1);
  });

  it("concurrent distinct payments keep the balance consistent (no lost updates)", async () => {
    await Tenant.updateOne(
      { _id: tenantId },
      { $set: { pendingBalance: 1_000_000 } },
    ); // ₹10,000 arrears
    await Promise.all(
      Array.from({ length: 5 }, () => pay({ amountPaid: 1000 })),
    );
    const tenant = await Tenant.findById(tenantId).lean();
    expect(tenant?.pendingBalance).toBe(500_000); // ₹5,000 left
    const receipts = (await RentHistory.find({ tenant: tenantId }).lean()).map(
      (r) => r.receiptNumber,
    );
    expect(new Set(receipts).size).toBe(5);
  });

  it("validates payment input", async () => {
    const res = await pay({ amountPaid: -1, rentMonth: "Smarch" });
    expect(res.status).toBe(400);
    const badKey = await pay({ amountPaid: 1 }, "x");
    expect(badKey.status).toBe(400);
  });

  it("queues a WhatsApp receipt only after the payment commits", async () => {
    await pay({ amountPaid: 15000 });
    await drainInMemoryJobs();
    const msg = await WhatsAppMessage.findOne({
      "context.type": "RENT_RECEIPT",
    }).lean();
    expect(msg?.body).toContain("RENT RECEIPT");
  });

  it("returns paginated rent history with month names and rupees", async () => {
    await pay({ amountPaid: 15000 });
    const res = await api()
      .get(`/api/tenants/${tenantId}/rent`)
      .set(owner.auth);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      amountPaid: 15000,
      rentMonth: thisMonth,
      rentYear: thisYear,
    });
    expect(res.body.meta.total).toBe(1);
  });

  it("dashboard aggregates by period (chronological) and floor, and refreshes after payments", async () => {
    const before = await api().get("/api/dashboard/stats").set(owner.auth);
    expect(before.status).toBe(200);
    expect(before.body.data.floorRentBreakdown).toEqual([]);

    await pay({ amountPaid: 15000 });
    await api()
      .post(`/api/tenants/${tenantId}/rent`)
      .set(owner.auth)
      .send({ amountPaid: 500, rentMonth: "January", rentYear: thisYear });

    const after = await api().get("/api/dashboard/stats").set(owner.auth);
    expect(after.body.data.floorRentBreakdown).toEqual([
      { floorStr: "3rd Floor", floorNum: 3, totalRent: 15000 },
    ]);
    const periods = after.body.data.monthlyRentBreakdown.map(
      (m: { period: number }) => m.period,
    );
    expect(periods).toEqual([...periods].sort((a, b) => a - b));
  });
});
