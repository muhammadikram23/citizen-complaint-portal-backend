const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a complaint title'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please provide a complaint description'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Please select a category'],
      enum: {
        values: ['Road', 'Garbage', 'Water', 'Electricity', 'Other'],
        message: '{VALUE} is not a valid category',
      },
    },
    area: {
      type: String,
      required: [true, 'Please provide an area or locality name'],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['Pending', 'In Progress', 'Resolved'],
        message: '{VALUE} is not a valid status',
      },
      default: 'Pending',
    },
    upvotes: {
      type: Number,
      default: 0,
    },
    upvotedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Complaint must belong to a user'],
    },
    officerRemark: {
      type: String,
      default: '',
      trim: true,
    },
    feedbackRating: {
      type: Number,
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      default: null,
    },
    feedbackComment: {
      type: String,
      default: '',
      trim: true,
    },
    feedbackGiven: {
      type: Boolean,
      default: false,
    },
    feedbackPending: {
      type: Boolean,
      default: false,
    },
    areaNormalized: {
      type: String,
      index: true,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: {
            values: ['Pending', 'In Progress', 'Resolved'],
            message: '{VALUE} is not a valid status',
          },
          default: 'Pending',
        },
        remark: {
          type: String,
          default: '',
          trim: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to auto-compute normalized area
complaintSchema.pre('save', function (next) {
  if (this.isModified('area') || !this.areaNormalized) {
    this.areaNormalized = (this.area || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  }
  next();
});

// Index for common filter queries and search
complaintSchema.index({ category: 1, areaNormalized: 1, status: 1 });
complaintSchema.index({ createdBy: 1 });
complaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
