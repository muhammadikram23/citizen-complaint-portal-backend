/**
 * Comprehensive End-to-End Automated Backend API Test Suite
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n🚀 Starting Citizen Complaint Portal Backend Test Suite...\n');
  process.env.NODE_ENV = 'test';
  process.env.PORT = '5001';

  let mongoServer;
  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGO_URI = mongoUri;
    console.log(`[Test In-Memory MongoDB Initialized]: ${mongoUri}`);
  } catch (mErr) {
    console.warn('Could not start MongoMemoryServer, falling back to process.env.MONGO_URI:', mErr.message);
  }

  // Load server and DB models after setting MONGO_URI
  const User = require('../models/User');
  const Complaint = require('../models/Complaint');
  const app = require('../server');

  const BASE_URL = `http://localhost:${process.env.PORT || 5001}`;
  await sleep(1500);

  let citizenToken = '';
  let officerToken = '';
  let citizenId = '';
  let complaintId = '';
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedCount++;
    }
  }

  try {
    // 1. Health Check
    console.log('--- Test 1: API Health Check ---');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /api/health returned 200 OK');

    // 2. Citizen Signup
    console.log('\n--- Test 2: Citizen Registration ---');
    const testEmail = `tester_${Date.now()}@citizen.org`;
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Citizen',
        email: testEmail,
        password: 'Password@123',
      }),
    });
    const signupData = await signupRes.json();
    assert(signupRes.status === 201 && signupData.user.role === 'citizen', 'POST /api/auth/signup created citizen with role "citizen"');

    // 3. Citizen Login
    console.log('\n--- Test 3: Citizen Login ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password@123',
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && !!loginData.token, 'POST /api/auth/login returned JWT token');
    citizenToken = loginData.token;
    citizenId = loginData.user.id;

    // 4. Officer Account Creation & Login
    console.log('\n--- Test 4: Officer Authentication ---');
    let officerUser = await User.findOne({ email: 'officer@citygov.org' });
    if (!officerUser) {
      officerUser = await User.create({
        name: 'City Officer',
        email: 'officer@citygov.org',
        password: 'Officer@123',
        role: 'officer',
      });
    }

    const offLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'officer@citygov.org',
        password: 'Officer@123',
      }),
    });
    const offLoginData = await offLoginRes.json();
    assert(offLoginRes.status === 200 && offLoginData.user.role === 'officer', 'POST /api/auth/login as officer succeeded');
    officerToken = offLoginData.token;

    // 5. Create Complaint as Citizen
    console.log('\n--- Test 5: Create Complaint ---');
    const createRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: 'Water pipe leak on Main Street',
        description: 'Clean drinking water is overflowing near Sector G-9 roundabout.',
        category: 'Water',
        area: 'Sector G-9',
      }),
    });
    const createData = await createRes.json();
    assert(
      createRes.status === 201 &&
      createData.complaint.status === 'Pending' &&
      createData.complaint.priority === 'Low' &&
      Array.isArray(createData.complaint.statusHistory) &&
      createData.complaint.statusHistory.length === 1 &&
      createData.complaint.statusHistory[0].status === 'Pending' &&
      createData.complaint.statusHistory[0].remark === 'Complaint filed',
      'POST /api/complaints created complaint with status: Pending, seeded statusHistory, & computed priority: Low'
    );
    complaintId = createData.complaint._id;

    // 6. Dedicated Duplicate Detection Endpoint Test
    console.log('\n--- Test 6: POST /api/complaints/check-duplicate ---');
    // 6a. Similar description in normalized area (e.g. "sector g-9")
    const dupRes = await fetch(`${BASE_URL}/api/complaints/check-duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: 'Broken water pipe leak',
        description: 'Drinking water is gushing out on the street near Sector G9 roundabout.',
        category: 'Water',
        area: 'sector g-9',
      }),
    });
    const dupData = await dupRes.json();
    assert(
      dupRes.status === 200 &&
      dupData.hasDuplicates === true &&
      dupData.matches.length > 0 &&
      dupData.matches[0].similarity >= 0.25,
      'POST /api/complaints/check-duplicate successfully identified duplicate report via Jaccard similarity & normalized area'
    );

    // 6b. Dissimilar complaint in same area
    const nonDupRes = await fetch(`${BASE_URL}/api/complaints/check-duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: 'Streetlight pole fallen',
        description: 'Electrical pole completely knocked down blocking alleyway.',
        category: 'Water',
        area: 'Sector G-9',
      }),
    });
    const nonDupData = await nonDupRes.json();
    assert(
      nonDupRes.status === 200 &&
      (nonDupData.hasDuplicates === false || nonDupData.matches.length === 0),
      'POST /api/complaints/check-duplicate correctly rejected non-duplicate complaint'
    );

    // 7. Upvote Complaint
    console.log('\n--- Test 7: Upvote Complaint ---');
    const upvoteRes = await fetch(`${BASE_URL}/api/complaints/${complaintId}/upvote`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const upvoteData = await upvoteRes.json();
    assert(
      upvoteRes.status === 200 && upvoteData.complaint.upvotes === 1,
      'PATCH /api/complaints/:id/upvote incremented upvote count to 1'
    );

    // 8. Prevent Double Upvoting
    console.log('\n--- Test 8: Prevent Duplicate Upvotes ---');
    const doubleUpvoteRes = await fetch(`${BASE_URL}/api/complaints/${complaintId}/upvote`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert(
      doubleUpvoteRes.status === 400,
      'PATCH /api/complaints/:id/upvote prevented duplicate upvoting'
    );

    // 9. Officer Status Update & feedbackPending trigger + statusHistory append
    console.log('\n--- Test 9: Officer Status Update to Resolved ---');
    const updateRes = await fetch(`${BASE_URL}/api/complaints/${complaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${officerToken}`,
      },
      body: JSON.stringify({
        status: 'Resolved',
        officerRemark: 'Pipeline valve replaced and pressure tested.',
      }),
    });
    const updateData = await updateRes.json();
    assert(
      updateRes.status === 200 &&
      updateData.complaint.status === 'Resolved' &&
      updateData.complaint.feedbackPending === true &&
      updateData.complaint.statusHistory.length === 2 &&
      updateData.complaint.statusHistory[1].status === 'Resolved' &&
      updateData.complaint.statusHistory[1].remark === 'Pipeline valve replaced and pressure tested.',
      'PATCH /api/complaints/:id/status marked Resolved, appended statusHistory, and triggered feedbackPending: true'
    );

    // 10. Citizen Feedback Submission
    console.log('\n--- Test 10: Citizen Rating & Feedback Submission ---');
    const feedbackRes = await fetch(`${BASE_URL}/api/complaints/${complaintId}/feedback`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        feedbackRating: 5,
        feedbackComment: 'Fixed within hours, great job team!',
      }),
    });
    const feedbackData = await feedbackRes.json();
    assert(
      feedbackRes.status === 200 &&
      feedbackData.complaint.feedbackGiven === true &&
      feedbackData.complaint.feedbackPending === false &&
      feedbackData.complaint.feedbackRating === 5,
      'PATCH /api/complaints/:id/feedback recorded 5-star rating and cleared feedbackPending'
    );

    // 11. Officer CSV Export
    console.log('\n--- Test 11: Officer CSV Export ---');
    const exportRes = await fetch(`${BASE_URL}/api/complaints/export`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const exportText = await exportRes.text();
    assert(
      exportRes.status === 200 &&
      exportRes.headers.get('content-type').includes('text/csv') &&
      exportText.includes('Water pipe leak on Main Street'),
      'GET /api/complaints/export generated valid CSV with complaint records'
    );

    // 12. AI Daily Briefing for Officers
    console.log('\n--- Test 12: AI Daily Briefing for Officers ---');
    const aiRes = await fetch(`${BASE_URL}/api/ai/officer-summary`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const aiData = await aiRes.json();
    assert(
      aiRes.status === 200 &&
      typeof aiData.summary === 'string' &&
      aiData.summary.length > 20 &&
      typeof aiData.stats === 'object',
      'POST /api/ai/officer-summary generated briefing and calculated accurate statistics'
    );
    console.log(`\n  [Generated Briefing Sample]:\n  "${aiData.summary}"\n`);

    // 13. Daily Complaint Limit (Spam Guard: 5 complaints/24h)
    console.log('\n--- Test 13: Daily Complaint Limit (Spam Guard) ---');
    // Citizen has filed 1 complaint so far. Let's file 4 more to hit the limit of 5.
    for (let i = 2; i <= 5; i++) {
      const res = await fetch(`${BASE_URL}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({
          title: `Complaint test batch #${i}`,
          description: `Description for complaint test batch #${i}`,
          category: 'Garbage',
          area: 'Sector G-9',
        }),
      });
      assert(res.status === 201, `POST /api/complaints allowed complaint #${i} under limit`);
    }

    // 6th complaint should be rejected with 429 Too Many Requests
    const sixthRes = await fetch(`${BASE_URL}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        title: '6th complaint exceeding daily limit',
        description: 'This complaint should trigger 429 daily limit protection.',
        category: 'Garbage',
        area: 'Sector G-9',
      }),
    });
    const sixthData = await sixthRes.json();
    assert(
      sixthRes.status === 429 &&
      sixthData.message.includes("You've reached the limit of 5 complaints per day"),
      'POST /api/complaints rejected 6th complaint in 24h with 429 Daily Limit'
    );

    console.log('=============================================');
    console.log(`Test Results: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('=============================================\n');

    if (mongoServer) {
      await mongoServer.stop();
    }
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    if (mongoServer) {
      await mongoServer.stop();
    }
    process.exit(1);
  }
}

runTests();
