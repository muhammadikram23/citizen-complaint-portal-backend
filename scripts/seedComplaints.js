const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Complaint = require('../models/Complaint');

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/citizen_complaint_portal';
    console.log(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);

    console.log('Cleaning old test data...');
    await Complaint.deleteMany({});
    await User.deleteMany({ email: { $ne: 'officer@example.com' } });

    // Ensure Officer exists
    let officer = await User.findOne({ email: 'officer@example.com' });
    if (!officer) {
      officer = await User.create({
        name: 'Chief Municipal Officer',
        email: 'officer@example.com',
        password: 'officier@123',
        role: 'officer',
      });
      console.log('Created officer account: officer@example.com');
    }

    // Create sample citizens
    const citizen1 = await User.create({
      name: 'Ahmed Khan',
      email: 'ahmed@citizen.org',
      password: 'Citizen@123',
      role: 'citizen',
    });

    const citizen2 = await User.create({
      name: 'Fatima Noor',
      email: 'fatima@citizen.org',
      password: 'Citizen@123',
      role: 'citizen',
    });

    const citizen3 = await User.create({
      name: 'Zain Malik',
      email: 'zain@citizen.org',
      password: 'Citizen@123',
      role: 'citizen',
    });

    console.log('Created 3 citizen accounts for testing.');

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Realistic complaints spanning different ages, upvotes, categories, and areas
    const sampleComplaints = [
      {
        title: 'Deep Pothole at Main Intersection',
        description: 'Large crater near the Sector G-9 traffic signal causing severe vehicle damage and tire punctures.',
        category: 'Road',
        area: 'Sector G-9',
        status: 'Pending',
        upvotes: 18, // 18 * 2 + 5 = 41 -> Critical
        upvotedBy: [citizen1._id, citizen2._id, citizen3._id],
        createdBy: citizen1._id,
        createdAt: new Date(now - 5 * day), // 5 days old
      },
      {
        title: 'Uncollected Garbage Dump Overflowing',
        description: 'Municipal garbage containers have been overflowing for over a week near Market 4. Strong odor and stray animal menace.',
        category: 'Garbage',
        area: 'Block D, North Town',
        status: 'In Progress',
        upvotes: 10, // 10 * 2 + 4 = 24 -> High
        upvotedBy: [citizen2._id, citizen3._id],
        createdBy: citizen2._id,
        officerRemark: 'Sanitation contractor notified. Dumpster replacement scheduled for tomorrow morning.',
        createdAt: new Date(now - 4 * day),
      },
      {
        title: 'Burst Main Pipeline Causing Flooding',
        description: 'Clean water gushing onto Street 12 since yesterday morning. Low water pressure in surrounding homes.',
        category: 'Water',
        area: 'Sector F-10',
        status: 'In Progress',
        upvotes: 8, // 8 * 2 + 1 = 17 -> High
        upvotedBy: [citizen1._id],
        createdBy: citizen3._id,
        officerRemark: 'Water authority repair crew dispatched on site.',
        createdAt: new Date(now - 1 * day),
      },
      {
        title: 'Streetlights Not Working Along Avenue 5',
        description: 'Four consecutive streetlights are out, creating pitch-black conditions at night and safety risks.',
        category: 'Electricity',
        area: 'Sector G-9',
        status: 'Pending',
        upvotes: 2, // 2 * 2 + 0 = 4 -> Low
        upvotedBy: [citizen1._id],
        createdBy: citizen1._id,
        createdAt: new Date(now - 6 * 60 * 60 * 1000), // 6 hours ago
      },
      {
        title: 'Broken Stormwater Drainage Grating',
        description: 'Metal drain cover is collapsed creating an open hazard for pedestrians on the sidewalk.',
        category: 'Other',
        area: 'Central Commercial Area',
        status: 'Resolved',
        upvotes: 6,
        upvotedBy: [citizen2._id, citizen3._id],
        createdBy: citizen2._id,
        officerRemark: 'Heavy-duty steel drain cover installed and cemented.',
        feedbackGiven: true,
        feedbackPending: false,
        feedbackRating: 5,
        feedbackComment: 'Prompt and sturdy repair within 24 hours. Excellent work!',
        createdAt: new Date(now - 3 * day),
        updatedAt: new Date(now - 1 * day),
      },
      {
        title: 'Open Electric Wire Hanging Near School Gate',
        description: 'Exposed live wire hanging from utility pole poses extreme danger to school children.',
        category: 'Electricity',
        area: 'Block D, North Town',
        status: 'Resolved',
        upvotes: 14,
        upvotedBy: [citizen1._id, citizen2._id],
        createdBy: citizen3._id,
        officerRemark: 'Emergency electrical team insulated the cables and secured the junction box.',
        feedbackGiven: false,
        feedbackPending: true, // Citizen prompt ready!
        createdAt: new Date(now - 2 * day),
        updatedAt: new Date(now - 4 * 60 * 60 * 1000),
      },
      {
        title: 'Stagnant Water and Mosquito Breeding',
        description: 'Large pool of standing water in the vacant plot next to House 44.',
        category: 'Water',
        area: 'Sector F-10',
        status: 'Pending',
        upvotes: 3, // 3 * 2 + 2 = 8 -> Medium
        upvotedBy: [citizen3._id],
        createdBy: citizen2._id,
        createdAt: new Date(now - 2 * day),
      },
    ];

    for (const data of sampleComplaints) {
      await Complaint.create(data);
    }

    console.log(`[SUCCESS] Seeded ${sampleComplaints.length} realistic complaints across various categories and priorities.`);
    console.log(`Demo Citizen:  ahmed@citizen.org / Citizen@123`);
    console.log(`Demo Officer:  officer@example.com / officier@123`);
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] Seeding failed:`, error);
    process.exit(1);
  }
};

seedData();
