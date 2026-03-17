const Flat = require('../models/Flat');
const { asyncHandler } = require('../utils/helpers');

// @desc    Get all flats (grouped by floor or simple list)
// @route   GET /api/flats
// @access  Private
exports.getFlats = asyncHandler(async (req, res) => {
  const flats = await Flat.find().populate('currentTenant');
  
  // Optionally group them by floor for the frontend if helpful, 
  // but usually better to let frontend group. We'll just return all.
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

// @desc    Create a flat (Initial Setup)
// @route   POST /api/flats
// @access  Private
exports.createFlat = asyncHandler(async (req, res) => {
  const { flatNumber, floor } = req.body;

  const flatExists = await Flat.findOne({ flatNumber });
  if (flatExists) {
    res.status(400).json({ message: 'Flat already exists' });
    return;
  }

  const flat = await Flat.create({
    flatNumber,
    floor
  });

  res.status(201).json(flat);
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
