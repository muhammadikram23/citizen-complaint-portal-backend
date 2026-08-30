const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const { normalizeArea } = require('../utils/similarity');

const backfill = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/citizen_complaint_portal';
    console.log(`Connecting to database at ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    const complaints = await Complaint.find({});
    console.log(`Found ${complaints.length} complaints to inspect for areaNormalized backfill...`);

    let updatedCount = 0;
    for (const c of complaints) {
      const normalized = normalizeArea(c.area);
      if (c.areaNormalized !== normalized) {
        c.areaNormalized = normalized;
        await c.save();
        updatedCount++;
      }
    }

    console.log(`[SUCCESS] Backfilled areaNormalized for ${updatedCount} complaints.`);
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] Backfill failed:', err);
    process.exit(1);
  }
};

backfill();
