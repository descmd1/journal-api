const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Journal name is required'],
    unique: true,
    trim: true
  },
  acronym: {
    type: String,
    required: [true, 'Journal acronym is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Journal description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  scope: {
    type: String,
    required: [true, 'Journal scope is required'],
    maxlength: [1500, 'Scope cannot exceed 1500 characters']
  },
  categories: [{
    type: String,
    required: true
  }],
  issn: {
    print: String,
    electronic: String
  },
  website: String,
  editor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  associateEditors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  editorialBoard: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['editor-in-chief', 'associate-editor', 'editorial-board-member', 'advisory-board-member']
    },
    expertise: [String]
  }],
  publishingSchedule: {
    frequency: {
      type: String,
      enum: ['monthly', 'bi-monthly', 'quarterly', 'bi-annual', 'annual'],
      required: true
    },
    issuesPerYear: {
      type: Number,
      required: true
    }
  },
  currentVolume: {
    type: Number,
    default: 1
  },
  currentIssue: {
    type: Number,
    default: 1
  },
  submissionGuidelines: {
    wordLimit: Number,
    formatRequirements: String,
    referenceStyle: {
      type: String,
      enum: ['APA', 'MLA', 'Chicago', 'Harvard', 'Vancouver', 'IEEE']
    },
    allowedFileTypes: [String],
    supplementaryMaterialAllowed: {
      type: Boolean,
      default: true
    }
  },
  peerReviewProcess: {
    type: {
      type: String,
      enum: ['single-blind', 'double-blind', 'open'],
      default: 'double-blind'
    },
    averageReviewTime: Number, // in days
    numberOfReviewers: {
      type: Number,
      default: 2
    }
  },
  fees: {
    submissionFee: {
      amount: {
        type: Number,
        default: 0
      },
      currency: {
        type: String,
        default: 'NGN'
      }
    },
    publicationFee: {
      amount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'NGN'
      }
    },
    discounts: [{
      description: String,
      percentage: Number,
      criteria: String
    }]
  },
  indexing: [{
    database: String,
    status: {
      type: String,
      enum: ['applied', 'indexed', 'not-applicable']
    },
    dateIndexed: Date
  }],
  impact: {
    citationIndex: Number,
    hIndex: Number,
    lastUpdated: Date
  },
  statistics: {
    totalSubmissions: {
      type: Number,
      default: 0
    },
    totalPublished: {
      type: Number,
      default: 0
    },
    acceptanceRate: {
      type: Number,
      default: 0
    },
    averageTimeToPublication: Number // in days
  },
  isActive: {
    type: Boolean,
    default: true
  },
  establishedDate: {
    type: Date,
    required: true
  },
  contactInfo: {
    email: {
      type: String,
      required: true
    },
    address: String,
    phone: String
  },
  socialMedia: {
    twitter: String,
    facebook: String,
    linkedin: String
  },
  logo: String, // URL to journal logo
  coverImage: String // URL to journal cover image
}, {
  timestamps: true
});

// Indexes
journalSchema.index({ name: 'text', description: 'text', scope: 'text' });
journalSchema.index({ categories: 1 });
journalSchema.index({ isActive: 1 });

module.exports = mongoose.model('Journal', journalSchema);