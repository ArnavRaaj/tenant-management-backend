import crypto from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { drainInMemoryJobs } from "../../src/core/queue/jobQueue";
import { currentPeriod } from "../../src/core/utils/period";
import { MaintenanceTicket } from "../../src/modules/maintenance/ticket.model";
import { WhatsAppMessage } from "../../src/modules/whatsapp/whatsappMessage.model";
import { useTestDatabase } from "../helpers/db";
import {
  api,
  assignTenant,
  createFlat,
  createSuperadmin,
  type TestUser,
} from "../helpers/factory";

const sign = (body: string) =>
  `sha256=${crypto.createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;

describe("Maintenance tickets", () => {
  useTestDatabase();
  let owner: TestUser;
  let tenantId: string;

  beforeAll(async () => {
    owner = await createSuperadmin();
    const flat = await createFlat(owner);
    tenantId = (await assignTenant(owner, flat._id))._id;
  });

  it("creates a classified ticket with an org-scoped sequential number (201)", async () => {
    const res = await api()
      .post("/api/maintenance/tickets")
      .set(owner.auth)
      .send({ tenantId, description: "Kitchen sink pipe leak ho raha hai" });
    expect(res.status).toBe(201);
    expect(res.body.data.ticket.category).toBe("PLUMBING");
    expect(res.body.data.ticket.ticketNumber).toMatch(
      new RegExp(`^TKT-${currentPeriod()}-\\d{6}$`),
    );
    expect(res.body.data.whatsappChatUrl).toMatch(
      /^https:\/\/wa\.me\/91\d{10}/,
    );
  });

  it("updates status (200), stamps resolvedAt and notifies the tenant on WhatsApp", async () => {
    const created = await api()
      .post("/api/maintenance/tickets")
      .set(owner.auth)
      .send({ tenantId, description: "Fan not working in bedroom" });
    const id = created.body.data.ticket._id;

    const res = await api()
      .patch(`/api/maintenance/tickets/${id}/status`)
      .set(owner.auth)
      .send({ status: "RESOLVED", resolutionNotes: "Capacitor replaced" });
    expect(res.status).toBe(200);
    expect(res.body.data.ticket.status).toBe("RESOLVED");
    expect(res.body.data.ticket.resolvedAt).toBeTruthy();
    expect(res.body.data.tenantNotified).toBe(true);

    await drainInMemoryJobs();
    const msg = await WhatsAppMessage.findOne({
      "context.referenceId": created.body.data.ticket.ticketNumber,
    }).lean();
    expect(msg?.body).toContain("Capacitor replaced");
  });

  it("rejects empty status updates and invalid enum values (400)", async () => {
    const created = await api()
      .post("/api/maintenance/tickets")
      .set(owner.auth)
      .send({ tenantId, description: "Door handle broken" });
    const id = created.body.data.ticket._id;
    expect(
      (
        await api()
          .patch(`/api/maintenance/tickets/${id}/status`)
          .set(owner.auth)
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await api()
          .patch(`/api/maintenance/tickets/${id}/status`)
          .set(owner.auth)
          .send({ status: "DONE" })
      ).status,
    ).toBe(400);
  });

  it("filters and paginates tickets; stats are org-scoped", async () => {
    const res = await api()
      .get("/api/maintenance/tickets?category=PLUMBING&limit=5")
      .set(owner.auth);
    expect(res.status).toBe(200);
    expect(
      res.body.data.every(
        (t: { category: string }) => t.category === "PLUMBING",
      ),
    ).toBe(true);
    expect(res.body.meta.limit).toBe(5);
    expect(res.body.data[0].tenant.contactNumber).toMatch(/^\d{10}$/); // decrypted for the UI

    const stats = await api().get("/api/maintenance/stats").set(owner.auth);
    expect(stats.status).toBe(200);
    expect(stats.body.data.statusStats.length).toBeGreaterThan(0);
  });
});

describe("WhatsApp webhook, simulator and logs", () => {
  useTestDatabase();
  let owner: TestUser;
  let phone: string;

  beforeAll(async () => {
    owner = await createSuperadmin();
    const flat = await createFlat(owner);
    const tenant = await assignTenant(owner, flat._id, {
      contactNumber: "9876543210",
      monthlyRent: 15000,
    });
    phone = tenant.contactNumber;
  });

  it("verifies the Meta subscription handshake with a constant-time token check", async () => {
    const ok = await api()
      .get("/api/whatsapp/webhook")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "test-verify-token",
        "hub.challenge": "c123",
      });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("c123");

    const bad = await api()
      .get("/api/whatsapp/webhook")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong",
        "hub.challenge": "c123",
      });
    expect(bad.status).toBe(403);
  });

  it("rejects webhook events without a valid X-Hub-Signature-256 (401)", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [],
    });
    const unsigned = await api()
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .send(body);
    expect(unsigned.status).toBe(401);
    const forged = await api()
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", "sha256=deadbeef")
      .send(body);
    expect(forged.status).toBe(401);
  });

  it("accepts a signed webhook, processes it in the background, and deduplicates retries", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: `91${phone}`,
                    id: "wamid.T1",
                    type: "text",
                    text: { body: "Bathroom tap leak ho raha hai" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const send = () =>
      api()
        .post("/api/whatsapp/webhook")
        .set("Content-Type", "application/json")
        .set("X-Hub-Signature-256", sign(body))
        .send(body);

    expect((await send()).status).toBe(200);
    await drainInMemoryJobs();
    expect((await send()).status).toBe(200); // Meta retry
    await drainInMemoryJobs();

    expect(
      await WhatsAppMessage.countDocuments({
        metaMessageId: "wamid.T1",
        direction: "INBOUND",
      }),
    ).toBe(1);
    expect(await MaintenanceTicket.countDocuments({ source: "WHATSAPP" })).toBe(
      1,
    );
  });

  it.each([
    ["Mera rent balance kitna baaki hai?", "RENT_INQUIRY", "Rent Status"],
    ["Please send my rent receipt", "RECEIPT_REQUEST", "Receipt"],
    ["KYC link bhejiye", "KYC_INQUIRY", "/kyc/"],
    ["Hi", "HELP_GREETING", "Resident Assistant"],
    ["Kitchen ka sink pipe leak kar raha hai", "MAINTENANCE", "Ticket Created"],
  ])("simulator routes %j → %s", async (message, intent, replyContains) => {
    const res = await api()
      .post("/api/whatsapp/dev/simulate-inbound")
      .send({ phone, message });
    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe(intent);
    expect(res.body.data.replyMessage).toContain(replyContains);
    // The response never carries the tenant record (previously leaked PII).
    expect(res.body.data).not.toHaveProperty("tenant");
  });

  it("does not mistake non-repair words for maintenance (word-boundary matching)", async () => {
    for (const message of [
      "Account details bhejo",
      "Please call back",
      "Main currently bahar hoon",
    ]) {
      const res = await api()
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({ phone, message });
      expect(res.body.data.intent).not.toBe("MAINTENANCE");
    }
  });

  it("politely handles unknown numbers", async () => {
    const res = await api()
      .post("/api/whatsapp/dev/simulate-inbound")
      .send({ phone: "919999999999", message: "Hello" });
    expect(res.body.data.intent).toBe("UNRECOGNIZED_TENANT");
  });

  it("logs are org-scoped even when filtering by phone", async () => {
    await drainInMemoryJobs();
    const other = await createSuperadmin();
    const mine = await api()
      .get(`/api/whatsapp/logs?phone=${phone}`)
      .set(owner.auth);
    const theirs = await api()
      .get(`/api/whatsapp/logs?phone=${phone}`)
      .set(other.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(theirs.body.data).toHaveLength(0);
  });

  it("status endpoint never reveals the webhook verify token", async () => {
    const res = await api().get("/api/whatsapp/status").set(owner.auth);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("test-verify-token");
  });
});
