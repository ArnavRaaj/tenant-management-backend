import { Request } from "express";
import {
  createTicketService,
  getTicketsService,
  getTicketByIdService,
  updateTicketStatusService,
  getMaintenanceStatsService,
} from "../service/maintenance/maintenance.service";
const { asyncHandler } = require("../utils/helpers");

// @desc    Create new maintenance ticket
// @route   POST /api/maintenance/tickets
export const createTicket = asyncHandler(async (req: Request) => {
  return await createTicketService(req);
});

// @desc    Get all maintenance tickets
// @route   GET /api/maintenance/tickets
export const getTickets = asyncHandler(async (req: Request) => {
  return await getTicketsService(req);
});

// @desc    Get single ticket by ID
// @route   GET /api/maintenance/tickets/:id
export const getTicketById = asyncHandler(async (req: Request) => {
  return await getTicketByIdService(req);
});

// @desc    Update ticket status and notes
// @route   PATCH /api/maintenance/tickets/:id/status
export const updateTicketStatus = asyncHandler(async (req: Request) => {
  return await updateTicketStatusService(req);
});

// @desc    Get maintenance stats
// @route   GET /api/maintenance/stats
export const getMaintenanceStats = asyncHandler(async (req: Request) => {
  return await getMaintenanceStatsService(req);
});

