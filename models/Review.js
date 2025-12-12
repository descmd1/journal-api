const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  manuscript: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manuscript',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  submittedDate: Date,
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'overdue'],
    default: 'pending'
  },
  recommendation: {
    type: String,
    enum: [
      'accept',
      'minor-revision',
      'major-revision',
      'reject'
    ]
  },
  // Evaluation criteria (1-5 scale)
  evaluation: {
    originality: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    },
    significance: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    },
    methodology: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    },
    clarity: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    },
    literature: {
      score: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String
    }
  },
  overallScore: {
    type: Number,
    min: 1,
    max: 5
  },
  confidenceLevel: {
    type: Number,
    min: 1,
    max: 5
  },
  strengths: {
    type: String,
    maxlength: [2000, 'Strengths section cannot exceed 2000 characters']
  },
  weaknesses: {
    type: String,
    maxlength: [2000, 'Weaknesses section cannot exceed 2000 characters']
  },
  specificComments: {
    type: String,
    maxlength: [5000, 'Specific comments cannot exceed 5000 characters']
  },
  confidentialComments: {
    type: String,
    maxlength: [2000, 'Confidential comments cannot exceed 2000 characters']
  },
  suggestedReviewers: [String],
  files: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isAnonymous: {
    type: Boolean,
    default: true
  },
  reminders: [{
    sentDate: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['initial', 'reminder', 'final']
    }
  }]
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ manuscript: 1 });
reviewSchema.index({ reviewer: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ dueDate: 1 });

// Calculate overall score before saving
reviewSchema.pre('save', function(next) {
  if (this.evaluation) {
    const scores = [];
    Object.keys(this.evaluation).forEach(key => {
      if (this.evaluation[key].score) {
        scores.push(this.evaluation[key].score);
      }
    });
    
    if (scores.length > 0) {
      this.overallScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }
  }
  
  // Update status if review is submitted
  if (this.isModified('recommendation') && this.recommendation && this.status === 'pending') {
    this.status = 'completed';
    this.submittedDate = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Review', reviewSchema);