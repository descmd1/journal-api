const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  manuscript: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Manuscript',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true // Amount in kobo (Nigerian currency subunit)
  },
  currency: {
    type: String,
    default: 'NGN'
  },
  paymentReference: {
    type: String,
    required: true,
    unique: true
  },
  paystackReference: {
    type: String,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'ussd', 'mobile_money'],
    default: 'card'
  },
  paymentGateway: {
    type: String,
    enum: ['paystack', 'flutterwave', 'stripe'],
    default: 'paystack'
  },
  transactionId: String,
  authorizationUrl: String,
  accessCode: String,
  // Paystack response data
  paystackData: {
    type: mongoose.Schema.Types.Mixed
  },
  // Payment metadata
  metadata: {
    publicationFee: Number,
    platformFee: Number,
    vendorReceives: Number,
    paymentFor: {
      type: String,
      default: 'publication_fee'
    }
  },
  // Payment completion details
  paidAt: Date,
  failureReason: String,
  refundDetails: {
    refunded: {
      type: Boolean,
      default: false
    },
    refundedAt: Date,
    refundAmount: Number,
    refundReason: String,
    refundReference: String
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ manuscript: 1 });
paymentSchema.index({ user: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentReference: 1 });
paymentSchema.index({ paystackReference: 1 });

// Generate unique payment reference
paymentSchema.pre('save', function(next) {
  if (!this.paymentReference) {
    this.paymentReference = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);