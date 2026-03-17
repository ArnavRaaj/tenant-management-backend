const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name']
    },
    age: {
      type: Number,
      required: [true, 'Please add age']
    },
    aadharNumber: {
      type: String,
      required: [true, 'Please add Aadhar number']
    },
    aadharImage: {
      type: String, // URL from Cloudinary
      default: ''
    },
    address: {
      type: String,
      required: [true, 'Please add address']
    },
    occupantsCount: {
      type: Number,
      required: [true, 'Please add number of occupants']
    },
    securityDeposit: {
      type: Number,
      required: [true, 'Please add security deposit amount']
    },
    monthlyRent: {
      type: Number,
      required: [true, 'Please add monthly rent amount']
    },
    pendingBalance: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true // Set to false when tenant leaves
    },
    flat: {
      type: mongoose.Schema.ObjectId,
      ref: 'Flat',
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Tenant', TenantSchema);
