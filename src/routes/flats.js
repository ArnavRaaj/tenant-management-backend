const express = require('express');
const router = express.Router();
const {
  getFlats,
  getFlat,
  createFlat,
  initializeFlats
} = require('../controllers/flatController');
const { protect } = require('../middlewares/authMiddleware');

// Route to quickly seed the database with the predefined flats
router.post('/init', protect, initializeFlats);

router.route('/')
  .get(protect, getFlats)
  .post(protect, createFlat);

router.route('/:id')
  .get(protect, getFlat);

module.exports = router;
