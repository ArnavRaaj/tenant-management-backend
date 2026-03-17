const mongoose = require('mongoose');

const FlatSchema = new mongoose.Schema(
  {
    flatNumber: {
      type: String,
      required: true,
      unique: true // e.g., '101', '102'
    },
    floor: {
      type: Number,
      required: true // 0 for Ground, 1 for First, 2 for Second
    },
    currentTenant: {
      type: mongoose.Schema.ObjectId,
      ref: 'Tenant',
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Flat', FlatSchema);
