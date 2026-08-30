const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getComplaints,
  getMyComplaints,
  getComplaintById,
  upvoteComplaint,
  updateStatus,
  submitFeedback,
  exportComplaints,
} = require('../controllers/complaintController');
const { protect, officerOnly } = require('../middleware/auth');

// Public & Citizen routes
router.route('/')
  .get(getComplaints)
  .post(protect, createComplaint);

router.get('/mine', protect, getMyComplaints);
router.get('/export', protect, officerOnly, exportComplaints);

router.get('/:id', getComplaintById);
router.patch('/:id/upvote', protect, upvoteComplaint);
router.patch('/:id/status', protect, officerOnly, updateStatus);
router.patch('/:id/feedback', protect, submitFeedback);

module.exports = router;
