const mongoose = require('mongoose');

const manuscriptSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [300, 'Title cannot exceed 300 characters']
  },
  abstract: {
    type: String,
    required: [true, 'Abstract is required'],
    maxlength: [2000, 'Abstract cannot exceed 2000 characters']
  },
  keywords: [{
    type: String,
    trim: true
  }],
  authors: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    institution: {
      type: String,
      required: true
    },
    isCorresponding: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      required: true
    }
  }],
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Agricultural Sciences',
      'Arts and Humanities',
      'Business and Economics',
      'Computer Science',
      'Education',
      'Engineering',
      'Environmental Science',
      'Health Sciences',
      'Law',
      'Life Sciences',
      'Physical Sciences',
      'Social Sciences',
      'Other'
    ]
  },
  subCategory: {
    type: String,
    trim: true
  },
  manuscriptType: {
    type: String,
    required: [true, 'Manuscript type is required'],
    enum: ['research-article', 'review-article', 'case-study', 'short-communication', 'editorial', 'letter']
  },
  files: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ['manuscript', 'figure', 'table', 'supplementary', 'cover-letter'],
      default: 'manuscript'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: [
      'draft',
      'submitted',
      'awaiting-reviewer-assignment',
      'under-review',
      'revision-requested',
      'revised',
      'accepted',
      'rejected',
      'published',
      'withdrawn'
    ],
    default: 'draft'
  },
  assignedEditor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  editorDecision: {
    decision: {
      type: String,
      enum: ['accept', 'minor-revisions', 'major-revisions', 'reject']
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    decidedAt: {
      type: Date
    },
    notes: String
  },
  revisionDeadline: {
    type: Date
  },
  publicationDetails: {
    publishedDate: Date,
    volume: String,
    issue: String, 
    pages: String,
    doi: String
  },
  // Article metrics for published articles
  metrics: {
    views: {
      type: Number,
      default: 0
    },
    downloads: {
      type: Number,
      default: 0
    },
    citations: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    lastViewed: Date
  },
  paymentCompleted: {
    type: Boolean,
    default: false
  },
  paymentReference: String,
  submissionDate: {
    type: Date
  },
  lastModified: {
    type: Date,
    default: Date.now
  },
  // Plagiarism check information
  plagiarismCheck: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    overallSimilarity: {
      type: Number,
      min: 0,
      max: 100
    },
    similarityStatus: {
      type: String,
      enum: ['acceptable', 'moderate', 'high']
    },
    scanDate: Date,
    report: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastChecked: Date
  },
  reviewAssignments: [{
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedDate: {
      type: Date,
      default: Date.now
    },
    dueDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'completed'],
      default: 'pending'
    }
  }],
  reviews: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }],
  editorNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  revisionHistory: [{
    version: {
      type: Number,
      required: true
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    files: [{
      filename: String,
      originalName: String,
      url: String,
      fileType: String
    }],
    revisionNotes: String
  }],
  publicationInfo: {
    publishedDate: Date,
    volume: Number,
    issue: Number,
    pageNumbers: String,
    doi: String
  },
  metrics: {
    views: {
      type: Number,
      default: 0
    },
    downloads: {
      type: Number,
      default: 0
    },
    citations: {
      type: Number,
      default: 0
    }
  },
  funding: {
    hasFunding: {
      type: Boolean,
      default: false
    },
    sources: [String]
  },
  ethics: {
    ethicalApproval: {
      type: Boolean,
      default: false
    },
    approvalNumber: String,
    conflictOfInterest: {
      type: Boolean,
      default: false
    },
    conflictDetails: String
  }
}, {
  timestamps: true
});

// Indexes
manuscriptSchema.index({ title: 'text', abstract: 'text', keywords: 'text' });
manuscriptSchema.index({ submittedBy: 1 });
manuscriptSchema.index({ status: 1 });
manuscriptSchema.index({ category: 1 });
manuscriptSchema.index({ submissionDate: -1 });

// Set submission date when status changes to submitted
manuscriptSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'submitted' && !this.submissionDate) {
    this.submissionDate = new Date();
  }
  this.lastModified = new Date();
  next();
});

module.exports = mongoose.model('Manuscript', manuscriptSchema);