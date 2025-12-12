const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['author', 'reviewer', 'editor', 'admin'],
    default: 'author'
  },
  institution: {
    type: String,
    required: [true, 'Institution is required'],
    trim: true
  },
  department: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    default: 'Nigeria',
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  expertise: [{
    type: String,
    trim: true
  }],
  orcidId: {
    type: String,
    trim: true
  },
  biography: {
    type: String,
    maxlength: [1000, 'Biography cannot exceed 1000 characters']
  },
  profilePicture: {
    type: String // URL to profile picture
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  lastLogin: Date,
  createdManuscripts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manuscript'
  }],
  reviewAssignments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }]
}, {
  timestamps: true
});

// Index for better search performance
userSchema.index({ email: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', institution: 'text' });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtual fields are serialised
userSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', userSchema);