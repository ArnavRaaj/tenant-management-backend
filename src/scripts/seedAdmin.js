/**
 * Seed / update admin user script.
 * Run with: node src/scripts/seedAdmin.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ADMIN_NAME = 'Arnav Admin';
const ADMIN_EMAIL = 'arnavraj22.official@gmail.com';
const ADMIN_PASSWORD = 'Arnav@admin12345';

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    // Update password directly (bypass pre-save hook to avoid double-hashing)
    await User.updateOne({ email: ADMIN_EMAIL }, { password: hashedPassword, name: ADMIN_NAME });
    console.log(`✅ Admin user updated: ${ADMIN_EMAIL}`);
  } else {
    // Create using plain-text password so the pre('save') hook hashes it properly
    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    console.log(`✅ Admin user created: ${ADMIN_EMAIL}`);
  }

  console.log('\n--- Admin Credentials ---');
  console.log(`Email   : ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log('------------------------\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
