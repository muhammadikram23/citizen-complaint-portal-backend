const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getComplaints,
  getMyComplaints,
  getDailyQuota,
  getComplaintById,
  upvoteComplaint,
  updateStatus,
  submitFeedback,
  exportComplaints,
  checkDuplicate,
} = require('../controllers/complaintController');
const { protect, officerOnly } = require('../middleware/auth');

const upload = require('../middleware/upload');

// Public & Citizen routes
router.route('/')
  .get(getComplaints)
  .post(protect, upload.single('photo'), createComplaint);

router.post('/check-duplicate', protect, checkDuplicate);
router.get('/daily-quota', protect, getDailyQuota);
router.get('/mine', protect, getMyComplaints);
router.get('/export', protect, officerOnly, exportComplaints);
router.get('/export/csv', protect, officerOnly, exportComplaints);

router.get('/:id', getComplaintById);
router.patch('/:id/upvote', protect, upvoteComplaint);
router.patch('/:id/status', protect, officerOnly, updateStatus);
router.patch('/:id/feedback', protect, submitFeedback);

module.exports = router;
