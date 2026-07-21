const mongoose = require('mongoose');
const Flat = require('../models/Flat');
const Tenant = require('../models/Tenant');
const RentHistory = require('../models/RentHistory');
const { asyncHandler } = require('../utils/helpers');

// @desc    Get all flats — supports ?status=vacant|occupied
// @route   GET /api/flats
// @access  Private
exports.getFlats = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status === 'vacant') filter.currentTenant = null;
  if (req.query.status === 'occupied') filter.currentTenant = { $ne: null };

  const flats = await Flat.find(filter).populate('currentTenant');
  res.status(200).json(flats);
});

// @desc    Get single flat
// @route   GET /api/flats/:id
// @access  Private
exports.getFlat = asyncHandler(async (req, res) => {
  const flat = await Flat.findById(req.params.id).populate('currentTenant');

  if (!flat) {
    res.status(404).json({ message: 'Flat not found' });
    return;
  }

  res.status(200).json(flat);
});

// @desc    Create a flat (floor-wise)
// @route   POST /api/flats
// @access  Private
exports.createFlat = asyncHandler(async (req, res) => {
  const { flatNumber, floor } = req.body;

  const flatExists = await Flat.findOne({ flatNumber });
  if (flatExists) {
    res.status(400).json({ message: 'Flat already exists' });
    return;
  }

  const flat = await Flat.create({ flatNumber, floor });
  res.status(201).json(flat);
});

// @desc    Delete a flat (only if unoccupied)
// @route   DELETE /api/flats/:id
// @access  Private
exports.deleteFlat = asyncHandler(async (req, res) => {
  const flat = await Flat.findById(req.params.id);

  if (!flat) {
    res.status(404).json({ message: 'Flat not found' });
    return;
  }

  if (flat.currentTenant) {
    res.status(400).json({ message: 'Cannot delete an occupied flat. Vacate the tenant first.' });
    return;
  }

  await flat.deleteOne();
  res.status(200).json({ message: 'Flat deleted successfully' });
});

// @desc    Get all tenants (past + current) who ever lived in this flat
// @route   GET /api/flats/:id/tenants
// @access  Private
exports.getFlatTenantHistory = asyncHandler(async (req, res) => {
  const flat = await Flat.findById(req.params.id);
  if (!flat) {
    res.status(404).json({ message: 'Flat not found' });
    return;
  }

  const tenants = await Tenant.find({ flat: req.params.id })
    .sort({ dateOfRenting: -1 })
    .select('name contactNumber dateOfRenting vacatedDate isActive monthlyRent securityDeposit pendingBalance');

  res.status(200).json(tenants);
});

// @desc    Get total revenue + monthly breakdown for a flat
// @route   GET /api/flats/:id/revenue
// @access  Private
exports.getFlatRevenue = asyncHandler(async (req, res) => {
  const flat = await Flat.findById(req.params.id);
  if (!flat) {
    res.status(404).json({ message: 'Flat not found' });
    return;
  }

  const monthlyBreakdown = await RentHistory.aggregate([
    { $match: { flat: new mongoose.Types.ObjectId(req.params.id) } },
    {
      $group: {
        _id: { month: '$rentMonth', year: '$rentYear' },
        totalPaid: { $sum: '$amountPaid' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  const grandTotal = monthlyBreakdown.reduce((sum, m) => sum + m.totalPaid, 0);

  const formatted = monthlyBreakdown.map(m => ({
    monthStr: `${m._id.month} ${m._id.year}`,
    month: m._id.month,
    year: m._id.year,
    totalPaid: m.totalPaid
  }));

  res.status(200).json({ grandTotal, monthlyBreakdown: formatted });
});

// @desc    Get vacancy periods for a flat (gaps between tenants)
// @route   GET /api/flats/:id/vacant-history
// @access  Private
exports.getFlatVacantHistory = asyncHandler(async (req, res) => {
  const flat = await Flat.findById(req.params.id);
  if (!flat) {
    res.status(404).json({ message: 'Flat not found' });
    return;
  }

  // All tenants for this flat sorted oldest first
  const tenants = await Tenant.find({ flat: req.params.id })
    .sort({ dateOfRenting: 1 })
    .select('name dateOfRenting vacatedDate isActive');

  const vacancyPeriods = [];

  for (let i = 0; i < tenants.length - 1; i++) {
    const current = tenants[i];
    const next = tenants[i + 1];

    // Gap exists if the current tenant has a vacated date before the next tenant moved in
    const vacatedAt = current.vacatedDate;
    const nextMovedIn = next.dateOfRenting;

    if (vacatedAt && nextMovedIn && vacatedAt < nextMovedIn) {
      vacancyPeriods.push({
        from: vacatedAt,
        to: nextMovedIn,
        prevTenant: current.name,
        nextTenant: next.name,
        daysVacant: Math.ceil((new Date(nextMovedIn) - new Date(vacatedAt)) / (1000 * 60 * 60 * 24))
      });
    }
  }

  // If the flat is currently vacant, add the open-ended period
  const lastTenant = tenants[tenants.length - 1];
  if (lastTenant && !flat.currentTenant && lastTenant.vacatedDate) {
    vacancyPeriods.push({
      from: lastTenant.vacatedDate,
      to: null, // Currently vacant
      prevTenant: lastTenant.name,
      nextTenant: null,
      daysVacant: Math.ceil((new Date() - new Date(lastTenant.vacatedDate)) / (1000 * 60 * 60 * 24))
    });
  }

  res.status(200).json(vacancyPeriods);
});

// Setup function to initialize the 14 flats quickly
exports.initializeFlats = asyncHandler(async (req, res) => {
  const count = await Flat.countDocuments();
  if (count > 0) {
    res.status(400).json({ message: 'Flats already initialized' });
    return;
  }

  const flatsToCreate = [
    // Ground floor: 6 flats
    { flatNumber: '101', floor: 0 }, { flatNumber: '102', floor: 0 },
    { flatNumber: '103', floor: 0 }, { flatNumber: '104', floor: 0 },
    { flatNumber: '105', floor: 0 }, { flatNumber: '106', floor: 0 },
    // First floor: 4 flats
    { flatNumber: '201', floor: 1 }, { flatNumber: '202', floor: 1 },
    { flatNumber: '203', floor: 1 }, { flatNumber: '204', floor: 1 },
    // Second floor: 4 flats
    { flatNumber: '301', floor: 2 }, { flatNumber: '302', floor: 2 },
    { flatNumber: '303', floor: 2 }, { flatNumber: '304', floor: 2 }
  ];

  await Flat.insertMany(flatsToCreate);
  res.status(201).json({ message: '14 Flats initialized successfully' });
});
