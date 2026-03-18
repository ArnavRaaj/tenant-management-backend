const RentHistory = require('../models/RentHistory');
const Flat = require('../models/Flat');
const { asyncHandler } = require('../utils/helpers');

// @desc    Get dashboard metrics (Monthly totals and floor-wise)
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = asyncHandler(async (req, res) => {
  // Aggregate rent by month and year
  const monthlyRent = await RentHistory.aggregate([
    {
      $group: {
        _id: { month: '$rentMonth', year: '$rentYear' },
        totalRent: { $sum: '$amountPaid' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  // Aggregate rent by floor filter out everything not in selected month
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
  const currentYearNum = new Date().getFullYear();

  const filterMonth = req.query.month || currentMonthName;
  const filterYear = req.query.year ? parseInt(req.query.year) : currentYearNum;

  const floorRent = await RentHistory.aggregate([
    {
      $match: {
        rentMonth: filterMonth,
        rentYear: filterYear
      }
    },
    {
      $lookup: {
        from: 'flats',
        localField: 'flat',
        foreignField: '_id',
        as: 'flatDetails'
      }
    },
    { $unwind: '$flatDetails' },
    {
      $group: {
        _id: '$flatDetails.floor',
        totalRent: { $sum: '$amountPaid' }
      }
    },
    { $sort: { '_id': 1 } } // Sort by floor (0, 1, 2)
  ]);

  // Total summary string mapping
  const floorMapping = {
    0: 'Ground Floor',
    1: 'First Floor',
    2: 'Second Floor'
  };

  const formattedFloorRent = floorRent.map(f => ({
    floorStr: floorMapping[f._id],
    floorNum: f._id,
    totalRent: f.totalRent
  }));

  const formattedMonthlyRent = monthlyRent.map(m => ({
    monthStr: `${m._id.month} ${m._id.year}`,
    totalRent: m.totalRent
  }));

  res.status(200).json({
    monthlyRentBreakdown: formattedMonthlyRent,
    floorRentBreakdown: formattedFloorRent
  });
});
