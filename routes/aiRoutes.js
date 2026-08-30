const express = require('express');
const router = express.Router();
const { getOfficerSummary } = require('../controllers/aiController');
const { protect, officerOnly } = require('../middleware/auth');

// Officer-only AI Daily Briefing endpoint (supports both POST and GET)
router.post('/officer-summary', protect, officerOnly, getOfficerSummary);
router.get('/officer-summary', protect, officerOnly, getOfficerSummary);

module.exports = router;
