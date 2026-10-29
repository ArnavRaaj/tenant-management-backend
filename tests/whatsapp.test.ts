import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/server";
vi.mock("../src/config/db", () => ({
  default: vi.fn(),
}));

vi.mock("../src/service/emailQueue.service", () => ({
  verifyEmailServiceConnection: vi.fn(),
  enqueueEmailJob: vi.fn().mockResolvedValue({ jobId: "job_test" }),
}));

// Mock repositories to test in-memory without needing live MongoDB
const mockMessages: any[] = [];
const mockTickets: any[] = [];

vi.mock("../src/repository/whatsapp.repository", () => ({
  createWhatsAppMessageRepo: vi.fn().mockImplementation(async (data) => {
    const doc = { ...data, _id: `msg_${Date.now()}`, createdAt: new Date() };
    mockMessages.push(doc);
    return doc;
  }),
  findWhatsAppMessagesRepo: vi.fn().mockImplementation(async () => mockMessages),
  countWhatsAppMessagesRepo: vi.fn().mockImplementation(async () => mockMessages.length),
  updateWhatsAppMessageStatusRepo: vi.fn().mockResolvedValue({ status: "READ" }),
  normalizePhoneNumber: vi.fn().mockImplementation((p: string) => {
    if (!p) return "";
    const clean = p.replace(/\D/g, "");
    return clean.length >= 10 ? clean.slice(-10) : clean;
  }),
  findTenantByPhoneNumberRepo: vi.fn().mockImplementation(async (phone: string) => {
    if (phone.includes("9876543210")) {
      return {
        _id: "672000000000000000000001",
        name: "Rahul Sharma",
        contactNumber: "9876543210",
        monthlyRent: 15000,
        pendingBalance: 15000,
        lastPaidMonth: "September",
        lastPaidYear: 2026,
        kycStatus: "PENDING",
        kycToken: "test_token_rahul",
        flat: { _id: "672000000000000000000002", flatNumber: "302", floor: 3 },
        organizationId: { _id: "672000000000000000000003", name: "Nivaasa Tower" },
      };
    }
    return null;
  }),
  findLatestRentHistoryByTenantRepo: vi.fn().mockResolvedValue({
    receiptNumber: "REC-202609-A8F1",
    amountPaid: 15000,
    paymentMode: "DIRECT_UPI",
    rentMonth: "September",
    rentYear: 2026,
    paymentDate: new Date("2026-09-03"),
  }),
}));

vi.mock("../src/repository/maintenance.repository", () => ({
  createMaintenanceTicketRepo: vi.fn().mockImplementation(async (data) => {
    const ticket = { ...data, _id: `tkt_${Date.now()}` };
    mockTickets.push(ticket);
    return ticket;
  }),
}));


describe("WhatsApp Service & Webhook Architecture", () => {
  beforeEach(() => {
    mockMessages.length = 0;
    mockTickets.length = 0;
  });

  describe("Meta Webhook Verification (GET /api/whatsapp/webhook)", () => {
    it("should successfully verify the webhook challenge when token matches", async () => {
      const challenge = "random_challenge_string_12345";
      const verifyToken =
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
        "nivaasa_whatsapp_verify_token_2026";

      const res = await request(app)
        .get("/api/whatsapp/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": verifyToken,
          "hub.challenge": challenge,
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe(challenge);
    });

    it("should reject verification with 403 when verify_token is invalid", async () => {
      const res = await request(app)
        .get("/api/whatsapp/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong_token",
          "hub.challenge": "challenge_123",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("mismatch");
    });
  });

  describe("WhatsApp Inbound Event Webhook (POST /api/whatsapp/webhook)", () => {
    it("should acknowledge Meta Cloud webhook with 200 EVENT_RECEIVED immediately", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WHATSAPP_BUS_ID",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "919876543210",
                      id: "wamid.test_001",
                      timestamp: "1730000000",
                      type: "text",
                      text: { body: "Bathroom tap leak ho raha hai" },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post("/api/whatsapp/webhook")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("EVENT_RECEIVED");
    });
  });

  describe("Dev Simulator Inbound Router (POST /api/whatsapp/dev/simulate-inbound)", () => {
    it("should reject simulation if phone or message is missing", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({ phone: "9876543210" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("should handle unrecognized numbers politely", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({
          phone: "919999999999",
          message: "Hello mujhe flat chahiye",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("UNRECOGNIZED_TENANT");
      expect(res.body.data.replyMessage).toContain("Nivaasa");
    });

    it("should classify maintenance complaints and auto-create a ticket with WhatsApp source", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({
          phone: "919876543210",
          message: "Kitchen ka sink pipe leak kar raha hai paani tapak raha hai",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("MAINTENANCE");
      expect(res.body.data.ticketCreated).toBeDefined();
      expect(res.body.data.ticketCreated.source).toBe("WHATSAPP");
      expect(res.body.data.ticketCreated.category).toBe("PLUMBING");
      expect(res.body.data.replyMessage).toContain("Ticket Created");
      expect(res.body.data.replyMessage).toContain("PLUMBING");
    });

    it("should handle rent balance inquiry for an active tenant", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({
          phone: "9876543210",
          message: "Mera rent balance kitna baaki hai?",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("RENT_INQUIRY");
      expect(res.body.data.replyMessage).toContain("Rent Status");
      expect(res.body.data.replyMessage).toContain("₹15,000");
    });

    it("should provide digital receipt details on receipt request", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({
          phone: "9876543210",
          message: "Please send my rent receipt",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("RECEIPT_REQUEST");
      expect(res.body.data.replyMessage).toContain("REC-202609-A8F1");
    });

    it("should provide 1-click KYC onboarding link when tenant asks for KYC", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({
          phone: "9876543210",
          message: "KYC link bhejiye onboarding ke liye",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("KYC_INQUIRY");
      expect(res.body.data.replyMessage).toContain("/kyc/");
    });

    it("should display the resident assistant menu on general greetings", async () => {
      const res = await request(app)
        .post("/api/whatsapp/dev/simulate-inbound")
        .send({
          phone: "9876543210",
          message: "Hi help",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe("HELP_GREETING");
      expect(res.body.data.replyMessage).toContain("Resident Assistant");
    });
  });
});
