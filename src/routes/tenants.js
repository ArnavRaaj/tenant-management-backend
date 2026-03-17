const express = require('express');
const router = express.Router();
const {
  getTenants,
  getTenant,
  createTenant,
  updateTenant,
  changeTenant,
  addRentRecord,
  getRentHistoryForTenant
} = require('../controllers/tenantController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.route('/')
  .get(protect, getTenants)
  .post(protect, upload.single('aadharImage'), createTenant);

router.route('/:id')
  .get(protect, getTenant)
  .put(protect, upload.single('aadharImage'), updateTenant);

router.post('/:id/change', protect, upload.single('aadharImage'), changeTenant);

router.route('/:id/rent')
  .get(protect, getRentHistoryForTenant)
  .post(protect, addRentRecord);

module.exports = router;
