const Complaint = require('../models/Complaint');
const { attachPriority, attachPriorityToArray } = require('../utils/priority');
const { normalizeArea, tokenize, jaccardSimilarity } = require('../utils/similarity');

let json2csvParser = null;
try {
  const json2csv = require('json2csv');
  if (json2csv.Parser) {
    json2csvParser = json2csv.Parser;
  } else if (typeof json2csv === 'function') {
    json2csvParser = json2csv;
  }
} catch (err) {
  console.warn('json2csv package load warning:', err.message);
}

// Fallback CSV formatter in case json2csv has version differences
const formatToCSV = (fields, data) => {
  const escapeVal = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerRow = fields.map(f => escapeVal(f.label || f)).join(',');
  const rows = data.map(item => {
    return fields.map(f => {
      const key = f.value || f;
      return escapeVal(item[key]);
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
};

const DAILY_COMPLAINT_LIMIT = 5;

// @desc    Create a new complaint
// @route   POST /api/complaints
// @access  Private (Citizen / Authenticated)
const createComplaint = async (req, res) => {
  try {
    const { title, description, category, area, imageUrl } = req.body;

    if (!title || !description || !category || !area) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, description, category, and area.',
      });
    }

    const validCategories = ['Road', 'Garbage', 'Water', 'Electricity', 'Other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category must be one of: ${validCategories.join(', ')}`,
      });
    }

    // Daily complaint limit check (Feature 3 spam guard)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const complaintsInLast24Hours = await Complaint.countDocuments({
      createdBy: req.user._id,
      createdAt: { $gte: twentyFourHoursAgo },
    });

    if (complaintsInLast24Hours >= DAILY_COMPLAINT_LIMIT) {
      return res.status(429).json({
        success: false,
        message: "You've reached the limit of 5 complaints per day. Please try again tomorrow.",
      });
    }

    let finalImageUrl = req.body.imageUrl || '';
    if (req.file) {
      finalImageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const complaint = await Complaint.create({
      title,
      description,
      category,
      area,
      imageUrl: finalImageUrl,
      createdBy: req.user._id,
      status: 'Pending',
      statusHistory: [
        {
          status: 'Pending',
          remark: 'Complaint filed',
          changedAt: new Date(),
        },
      ],
    });

    const populated = await Complaint.findById(complaint._id).populate('createdBy', 'name email');
    const complaintWithPriority = attachPriority(populated);

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      complaint: complaintWithPriority,
    });
  } catch (error) {
    console.error('createComplaint error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error creating complaint.',
    });
  }
};

// @desc    Get all complaints (public feed with search & filters, dynamic priority)
// @route   GET /api/complaints
// @access  Public
const getComplaints = async (req, res) => {
  try {
    const { category, area, status, search, priority, sortBy } = req.query;
    const query = {};

    // Filter by category (supports comma-separated list like "Road,Water")
    if (category) {
      const categories = category.split(',').map(c => c.trim());
      if (categories.length === 1) {
        query.category = new RegExp(`^${categories[0]}$`, 'i');
      } else {
        query.category = { $in: categories.map(c => new RegExp(`^${c}$`, 'i')) };
      }
    }

    // Filter by area (supports substring search or comma separated)
    if (area) {
      const areas = area.split(',').map(a => a.trim());
      if (areas.length === 1) {
        query.area = new RegExp(areas[0], 'i');
      } else {
        query.area = { $in: areas.map(a => new RegExp(a, 'i')) };
      }
    }

    // Filter by status (e.g. "Pending", "In Progress", "pending,in-progress")
    if (status) {
      const rawStatuses = status.split(',').map(s => s.trim().toLowerCase());
      const statusMap = {
        'pending': 'Pending',
        'in progress': 'In Progress',
        'in-progress': 'In Progress',
        'resolved': 'Resolved',
      };
      
      const mappedStatuses = rawStatuses
        .map(s => statusMap[s] || s)
        .filter(Boolean);

      if (mappedStatuses.length === 1) {
        query.status = mappedStatuses[0];
      } else if (mappedStatuses.length > 1) {
        query.status = { $in: mappedStatuses };
      }
    }

    // General text search on title, description, or area
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { area: searchRegex },
      ];
    }

    // Fetch complaints with sorting (default newest)
    let mongoSort = { createdAt: -1 };
    if (sortBy === 'upvotes') {
      mongoSort = { upvotes: -1, createdAt: -1 };
    } else if (sortBy === 'oldest') {
      mongoSort = { createdAt: 1 };
    }

    const rawComplaints = await Complaint.find(query)
      .populate('createdBy', 'name email')
      .sort(mongoSort);

    // Compute dynamic priority on all fetched complaints
    let complaints = attachPriorityToArray(rawComplaints);

    // If filtered by computed priority level (Low, Medium, High, Critical)
    if (priority) {
      const targetPriority = priority.toLowerCase();
      complaints = complaints.filter(
        c => c.priority.toLowerCase() === targetPriority
      );
    }

    // If requested sort by priority score
    if (sortBy === 'priority') {
      complaints.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error('getComplaints error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching complaints.',
    });
  }
};

// @desc    Get complaints filed by current user
// @route   GET /api/complaints/mine
// @access  Private (Citizen)
const getMyComplaints = async (req, res) => {
  try {
    const rawComplaints = await Complaint.find({ createdBy: req.user._id })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const complaints = attachPriorityToArray(rawComplaints);

    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error('getMyComplaints error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching user complaints.',
    });
  }
};

// @desc    Get single complaint by ID
// @route   GET /api/complaints/:id
// @access  Public
const getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.',
      });
    }

    const complaintWithPriority = attachPriority(complaint);

    res.status(200).json({
      success: true,
      complaint: complaintWithPriority,
    });
  } catch (error) {
    console.error('getComplaintById error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error fetching complaint.',
    });
  }
};

// @desc    Upvote a complaint
// @route   PATCH /api/complaints/:id/upvote
// @access  Private (Citizen / Authenticated)
const upvoteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.',
      });
    }

    const userIdStr = req.user._id.toString();
    const alreadyUpvoted = complaint.upvotedBy.some(
      uid => uid.toString() === userIdStr
    );

    if (alreadyUpvoted) {
      return res.status(400).json({
        success: false,
        message: 'You have already upvoted this complaint.',
      });
    }

    complaint.upvotedBy.push(req.user._id);
    complaint.upvotes = complaint.upvotedBy.length;
    await complaint.save();

    const populated = await Complaint.findById(complaint._id).populate('createdBy', 'name email');
    const complaintWithPriority = attachPriority(populated);

    res.status(200).json({
      success: true,
      message: 'Complaint upvoted successfully.',
      complaint: complaintWithPriority,
    });
  } catch (error) {
    console.error('upvoteComplaint error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error upvoting complaint.',
    });
  }
};

// @desc    Update complaint status and officer remark
// @route   PATCH /api/complaints/:id/status
// @access  Private (Officer Only)
const updateStatus = async (req, res) => {
  try {
    const { status, officerRemark } = req.body;

    const validStatuses = ['Pending', 'In Progress', 'Resolved'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.',
      });
    }

    const newStatus = status || complaint.status;
    const newRemark = officerRemark !== undefined ? officerRemark : (complaint.officerRemark || '');

    if (status) {
      complaint.status = status;
      // Section 5.12: When marked Resolved, trigger feedbackPending: true if feedback not given yet
      if (status === 'Resolved' && !complaint.feedbackGiven) {
        complaint.feedbackPending = true;
      }
    }

    if (officerRemark !== undefined) {
      complaint.officerRemark = officerRemark;
    }

    // Append to statusHistory audit trail
    complaint.statusHistory.push({
      status: newStatus,
      remark: newRemark,
      changedAt: new Date(),
    });

    await complaint.save();

    const populated = await Complaint.findById(complaint._id).populate('createdBy', 'name email');
    const complaintWithPriority = attachPriority(populated);

    res.status(200).json({
      success: true,
      message: 'Complaint status updated successfully.',
      complaint: complaintWithPriority,
    });
  } catch (error) {
    console.error('updateStatus error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error updating complaint status.',
    });
  }
};

// @desc    Submit citizen feedback after resolution
// @route   PATCH /api/complaints/:id/feedback
// @access  Private (Citizen owner only)
const submitFeedback = async (req, res) => {
  try {
    const { rating, feedbackRating, feedbackComment } = req.body;
    const finalRating = Number(rating || feedbackRating);

    if (!finalRating || finalRating < 1 || finalRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a feedback rating between 1 and 5.',
      });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found.',
      });
    }

    // Check ownership
    if (complaint.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only provide feedback for your own complaints.',
      });
    }

    // Check if complaint is resolved
    if (complaint.status !== 'Resolved') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted for resolved complaints.',
      });
    }

    complaint.feedbackRating = finalRating;
    complaint.feedbackComment = feedbackComment || '';
    complaint.feedbackGiven = true;
    complaint.feedbackPending = false;

    await complaint.save();

    const populated = await Complaint.findById(complaint._id).populate('createdBy', 'name email');
    const complaintWithPriority = attachPriority(populated);

    res.status(200).json({
      success: true,
      message: 'Feedback submitted successfully. Thank you for helping improve our civic services!',
      complaint: complaintWithPriority,
    });
  } catch (error) {
    console.error('submitFeedback error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error submitting feedback.',
    });
  }
};

// @desc    Export complaints to CSV (with filters)
// @route   GET /api/complaints/export
// @access  Private (Officer Only)
const exportComplaints = async (req, res) => {
  try {
    const { category, area, status, search, priority } = req.query;
    const query = {};

    if (category) {
      const categories = category.split(',').map(c => c.trim());
      if (categories.length === 1) {
        query.category = new RegExp(`^${categories[0]}$`, 'i');
      } else {
        query.category = { $in: categories.map(c => new RegExp(`^${c}$`, 'i')) };
      }
    }

    if (area) {
      const areas = area.split(',').map(a => a.trim());
      if (areas.length === 1) {
        query.area = new RegExp(areas[0], 'i');
      } else {
        query.area = { $in: areas.map(a => new RegExp(a, 'i')) };
      }
    }

    if (status) {
      const rawStatuses = status.split(',').map(s => s.trim().toLowerCase());
      const statusMap = {
        'pending': 'Pending',
        'in progress': 'In Progress',
        'in-progress': 'In Progress',
        'resolved': 'Resolved',
      };
      
      const mappedStatuses = rawStatuses
        .map(s => statusMap[s] || s)
        .filter(Boolean);

      if (mappedStatuses.length === 1) {
        query.status = mappedStatuses[0];
      } else if (mappedStatuses.length > 1) {
        query.status = { $in: mappedStatuses };
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { area: searchRegex },
      ];
    }

    const rawComplaints = await Complaint.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    let complaints = attachPriorityToArray(rawComplaints);

    if (priority) {
      const targetPriority = priority.toLowerCase();
      complaints = complaints.filter(
        c => c.priority.toLowerCase() === targetPriority
      );
    }

    // Map data for CSV format
    const csvData = complaints.map(c => ({
      ID: c._id ? c._id.toString() : '',
      Title: c.title || '',
      Category: c.category || '',
      Area: c.area || '',
      Status: c.status || '',
      Priority: c.priority || 'Low',
      Upvotes: c.upvotes || 0,
      'Filed By': c.createdBy ? `${c.createdBy.name} (${c.createdBy.email})` : 'Anonymous',
      'Filed On': c.createdAt ? new Date(c.createdAt).toISOString() : '',
      'Last Updated': c.updatedAt ? new Date(c.updatedAt).toISOString() : '',
      'Officer Remark': c.officerRemark || 'None',
      'Citizen Rating': c.feedbackGiven ? `${c.feedbackRating} / 5` : 'Not Provided',
      'Citizen Feedback': c.feedbackComment || '',
    }));

    const fields = [
      'ID',
      'Title',
      'Category',
      'Area',
      'Status',
      'Priority',
      'Upvotes',
      'Filed By',
      'Filed On',
      'Last Updated',
      'Officer Remark',
      'Citizen Rating',
      'Citizen Feedback',
    ];

    let csv = '';
    if (json2csvParser) {
      try {
        const parser = new json2csvParser({ fields });
        csv = parser.parse(csvData);
      } catch (pErr) {
        csv = formatToCSV(fields, csvData);
      }
    } else {
      csv = formatToCSV(fields, csvData);
    }

    const filename = `complaints_export_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error('exportComplaints error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error exporting complaints.',
    });
  }
};

// @desc    Check for duplicate complaints using area normalization and token similarity
// @route   POST /api/complaints/check-duplicate
// @access  Private (Citizen / Authenticated)
const checkDuplicate = async (req, res) => {
  try {
    const { title, description, category, area } = req.body;
    if (!category || !area || !title) {
      return res.status(400).json({
        success: false,
        message: 'title, category, and area are required.',
      });
    }

    const areaNormalized = normalizeArea(area);

    const candidates = await Complaint.find({
      category: new RegExp(`^${category}$`, 'i'),
      areaNormalized,
      status: { $in: ['Pending', 'In Progress'] },
    }).populate('createdBy', 'name');

    const inputTokens = tokenize(`${title} ${description || ''}`);

    const scored = candidates
      .map((c) => {
        const candidateTokens = tokenize(`${c.title} ${c.description}`);
        const similarity = jaccardSimilarity(inputTokens, candidateTokens);
        return { c, similarity };
      })
      .filter(({ similarity }) => similarity >= 0.25)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    const matches = scored.map(({ c, similarity }) => {
      const withPriority = attachPriority(c);
      return {
        id: c._id,
        _id: c._id,
        title: c.title,
        description: c.description,
        area: c.area,
        category: c.category,
        status: c.status,
        upvotes: c.upvotes,
        priority: withPriority.priority,
        priorityScore: withPriority.priorityScore,
        similarity: Number(similarity.toFixed(2)),
        createdAt: c.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      hasDuplicates: matches.length > 0,
      matches,
    });
  } catch (error) {
    console.error('checkDuplicate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error checking duplicates.',
    });
  }
};

module.exports = {
  createComplaint,
  getComplaints,
  getMyComplaints,
  getComplaintById,
  upvoteComplaint,
  updateStatus,
  submitFeedback,
  exportComplaints,
  checkDuplicate,
};
