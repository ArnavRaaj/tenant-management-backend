import express from "express";
import {
  createTicket,
  getTickets,
  getTicketById,
  updateTicketStatus,
  getMaintenanceStats,
} from "../controllers/maintenance.controller";
import {
  getTicketsSchema,
  createTicketSchema,
  ticketIdParamSchema,
  updateTicketStatusSchema,
} from "../validations/maintenance.validation";
const { protect } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validationMiddleware");

const router = express.Router();

router.get("/stats", protect, getMaintenanceStats);

router
  .route("/tickets")
  .get(protect, validateRequest(getTicketsSchema), getTickets)
  .post(protect, validateRequest(createTicketSchema), createTicket);

router
  .route("/tickets/:id")
  .get(protect, validateRequest(ticketIdParamSchema), getTicketById);

router.patch(
  "/tickets/:id/status",
  protect,
  validateRequest(updateTicketStatusSchema),
  updateTicketStatus,
);

export default router;

