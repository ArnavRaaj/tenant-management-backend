const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [/^[\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/, "Please add a valid email"],
    },
    role: {
      type: String,
      enum: ["superadmin", "admin"],
      default: "superadmin", // Default for signups
    },
    superadminId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null, // Null means this user is the top-level superadmin
    },
    isVerified: {
      type: Boolean,
      default: false, // Must verify OTP on signup
    },
    inviteToken: {
      type: String,
      default: null, // Used for inviting admins
    },
    password: {
      type: String,
      select: false,
    },
    resetPasswordOtp: {
      type: String,
      select: false,
    },
    resetPasswordOtpExpire: {
      type: Date,
      select: false,
    },
    emailVerificationOtp: {
      type: String,
      select: false,
    },
    emailVerificationOtpExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

UserSchema.index({ superadminId: 1 });
UserSchema.index({ role: 1 });

// Encrypt password using bcrypt
UserSchema.pre("save", async function (this: any) {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (
  this: any,
  enteredPassword: string,
) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
