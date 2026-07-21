const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name']
    },
    contactNumber: {
      type: String,
      required: [true, 'Please add a contact number']
    },
    age: {
      type: Number,
    },
    aadharNumber: {
      type: String,
    },
    aadharImage: {
      type: String, // URL from Cloudinary
      default: ''
    },
    address: {
      type: String,
    },
    occupantsCount: {
      type: Number,
      default: 1
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
    vacatedDate: {
      type: Date,
      default: null // Set when tenant vacates or is changed out
    },
    dateOfRenting: {
      type: Date,
      default: Date.now
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
