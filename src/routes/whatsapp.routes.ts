import { Router } from "express";
import {
  verifyWebhook,
  handleMetaWebhook,
  simulateInboundMessage,
  getWhatsAppLogs,
  getWhatsAppConfigStatus,
} from "../controllers/whatsapp.controller";
const { protect } = require("../middlewares/authMiddleware");

const router = Router();

// Meta Cloud API Webhook endpoints (Public - Meta communicates directly)
router.get("/webhook", verifyWebhook);
router.post("/webhook", handleMetaWebhook);

// Dev / Testing Simulator endpoint
router.post("/dev/simulate-inbound", simulateInboundMessage);

// Admin Diagnostics & Communication Logs (Protected)
router.get("/logs", protect, getWhatsAppLogs);
router.get("/status", protect, getWhatsAppConfigStatus);

export default router;

