const mongoose = require("mongoose");

const FloorSchema = new mongoose.Schema(
  {
    floorNumber: {
      type: Number,
      required: [true, "Please add a floor number"],
      unique: true,
      min: 0,
    },
    name: {
      type: String,
      required: [true, "Please add a floor name"],
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

FloorSchema.index({ order: 1 });
FloorSchema.index({ isActive: 1 });

const Floor =
  mongoose.models.Floor || mongoose.model("Floor", FloorSchema);
export default Floor;
