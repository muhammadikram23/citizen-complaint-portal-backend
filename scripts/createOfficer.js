const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const seedOfficer = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/citizen_complaint_portal';
    console.log(`Connecting to database at ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    const email = (process.env.OFFICER_EMAIL || 'officer@citygov.org').toLowerCase().trim();
    const name = process.env.OFFICER_NAME || 'City Officer';
    const password = process.env.OFFICER_PASSWORD || 'Officer@123';

    const existingOfficer = await User.findOne({ email });
    if (existingOfficer) {
      console.log(`[INFO] Officer account already exists: ${existingOfficer.email} (${existingOfficer.role})`);
      if (existingOfficer.role !== 'officer') {
        existingOfficer.role = 'officer';
        await existingOfficer.save();
        console.log(`[UPDATED] User role updated to 'officer'.`);
      }
      process.exit(0);
    }

    const officer = await User.create({
      name,
      email,
      password,
      role: 'officer',
    });

    console.log(`=============================================`);
    console.log(`[SUCCESS] Officer Account Created!`);
    console.log(`Name:     ${officer.name}`);
    console.log(`Email:    ${officer.email}`);
    console.log(`Password: ${password}`);
    console.log(`Role:     ${officer.role}`);
    console.log(`=============================================`);
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] Failed to seed officer:`, error.message);
    process.exit(1);
  }
};

seedOfficer();
