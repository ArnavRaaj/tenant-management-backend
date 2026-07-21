const express = require('express');
const router = express.Router();
const {
  getFlat,
  getFlats,
  createFlat,
  deleteFlat,
  getFlatRevenue,
  initializeFlats,
  getFlatTenantHistory,
  getFlatVacantHistory
} = require('../controllers/flatController');
const { protect } = require('../middlewares/authMiddleware');

// Route to quickly seed the database with the predefined flats
router.post('/init', protect, initializeFlats);

router.route('/')
  .get(protect, getFlats)       // supports ?status=vacant|occupied
  .post(protect, createFlat);

router.route('/:id')
  .get(protect, getFlat)
  .delete(protect, deleteFlat); // only allowed when unoccupied

// Flat-scoped history & analytics
router.get('/:id/tenants', protect, getFlatTenantHistory);       // All tenants ever in this flat
router.get('/:id/revenue', protect, getFlatRevenue);             // Revenue breakdown for this flat
router.get('/:id/vacant-history', protect, getFlatVacantHistory); // Vacancy periods for this flat

module.exports = router;
