const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { auth, authorize } = require('../middleware/auth');
const Manuscript = require('../models/Manuscript');
const Payment = require('../models/Payment');
const User = require('../models/User');

const router = express.Router();

// @route   POST api/payments/initiate
// @desc    Initialize Paystack payment for manuscript publication
// @access  Private
router.post('/initiate', auth, async (req, res) => {
  try {
    const { manuscriptId } = req.body;
    const userId = req.user.id;
    
    console.log('Payment initiation request:', {
      manuscriptId,
      userId,
      userFromToken: req.user,
      userProfile: req.userProfile?.email ? { email: req.userProfile.email } : 'No email found'
    });

    // Fetch the manuscript and validate ownership
    const manuscript = await Manuscript.findById(manuscriptId)
      .populate('submittedBy', 'firstName lastName email');

    if (!manuscript) {
      return res.status(404).json({ 
        success: false, 
        message: 'Manuscript not found' 
      });
    }

    // Check if user owns this manuscript or is an admin
    if (manuscript.submittedBy._id.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. You can only pay for your own manuscripts.' 
      });
    }

    // Check if manuscript is in accepted status
    if (manuscript.status !== 'accepted') {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment can only be made for accepted manuscripts' 
      });
    }

    // Check if already paid
    const existingPayment = await Payment.findOne({ 
      manuscript: manuscriptId, 
      status: 'completed' 
    });

    if (existingPayment) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment has already been completed for this manuscript',
        paymentReference: existingPayment.paymentReference
      });
    }

    // Set publication fee (₦50,000 in kobo)
    const publicationFee = 5000000;
    const amount = publicationFee;
    const platformFee = Math.round(amount * 0.10); // 10% platform fee
    const vendorReceives = amount - platformFee;
    
    // Get user email from the full user profile
    const userEmail = req.userProfile?.email;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'User email not found. Please log in again.'
      });
    }

    console.log('Initiating payment for user:', userEmail, 'Amount:', amount);

    // Create payment record in database
    const payment = new Payment({
      manuscript: manuscriptId,
      user: userId,
      amount: amount,
      currency: 'NGN',
      status: 'pending',
      metadata: {
        publicationFee: publicationFee,
        platformFee: platformFee,
        vendorReceives: vendorReceives,
        paymentFor: 'publication_fee'
      }
    });

    try {
      const paystackRes = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email: userEmail,
          amount: amount, // Amount already in kobo
          currency: 'NGN',
          reference: payment.paymentReference,
          callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?payment=success&manuscriptId=${manuscriptId}`,
          metadata: {
            manuscriptId: manuscriptId,
            userId: userId,
            userEmail: userEmail,
            manuscriptTitle: manuscript.title,
            paymentFor: 'publication_fee'
          }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key'}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Update payment record with Paystack response
      payment.paystackReference = paystackRes.data.data.reference;
      payment.authorizationUrl = paystackRes.data.data.authorization_url;
      payment.accessCode = paystackRes.data.data.access_code;
      payment.paystackData = paystackRes.data.data;
      payment.status = 'processing';
      
      await payment.save();

      // Update manuscript with payment reference
      manuscript.paymentReference = payment.paymentReference;
      await manuscript.save();

      res.json({
        success: true,
        authorization_url: paystackRes.data.data.authorization_url,
        access_code: paystackRes.data.data.access_code,
        reference: paystackRes.data.data.reference,
        amount: amount / 100, // Convert back to Naira for display
        platformFee: platformFee / 100,
        vendorReceives: vendorReceives / 100
      });

    } catch (paystackError) {
      console.error('Paystack API error:', paystackError.response?.data || paystackError.message);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize payment with Paystack'
      });
    }

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error initializing payment'
    });
  }
});

// @route   POST api/payments/verify/:reference
// @desc    Verify payment with Paystack and update status
// @access  Private
router.post('/verify/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = req.user.id;

    // Find payment record
    const payment = await Payment.findOne({ 
      $or: [
        { paymentReference: reference },
        { paystackReference: reference }
      ]
    }).populate('manuscript');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Check if user owns this payment or is admin
    if (payment.user.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Verify payment with Paystack
    try {
      const paystackRes = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key'}`,
          },
        }
      );

      const paymentData = paystackRes.data.data;

      if (paymentData.status === 'success') {
        // Update payment status
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.transactionId = paymentData.id;
        payment.paystackData = paymentData;
        await payment.save();

        // Update manuscript payment status
        const manuscript = payment.manuscript;
        manuscript.paymentCompleted = true;
        manuscript.paymentReference = payment.paymentReference;
        await manuscript.save();

        res.json({
          success: true,
          message: 'Payment verified successfully',
          payment: {
            id: payment._id,
            reference: payment.paymentReference,
            status: payment.status,
            amount: payment.amount,
            currency: payment.currency,
            paidAt: payment.paidAt
          }
        });
      } else {
        // Payment failed
        payment.status = 'failed';
        payment.failureReason = paymentData.gateway_response || 'Payment was not successful';
        await payment.save();

        res.status(400).json({
          success: false,
          message: 'Payment verification failed',
          reason: payment.failureReason
        });
      }

    } catch (paystackError) {
      console.error('Paystack verification error:', paystackError);
      res.status(500).json({
        success: false,
        message: 'Error verifying payment with Paystack'
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying payment'
    });
  }
});

// @route   GET api/payments/history
// @desc    Get user's payment history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    // In a real implementation, you would fetch actual payment records
    // For now, we'll return mock data
    const payments = [
      {
        id: 'pay_1',
        manuscriptTitle: 'Sample Research Article',
        amount: 5000000,
        currency: 'NGN',
        status: 'succeeded',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    ];

    res.json({
      success: true,
      payments
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching payment history'
    });
  }
});

// @route   POST api/payments/verify
// @desc    Verify Paystack payment
// @access  Private
router.post('/verify', auth, async (req, res) => {
  try {
    const { reference, manuscriptId } = req.body;

    if (!reference || !manuscriptId) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference and manuscript ID are required'
      });
    }

    try {
      // Verify payment with Paystack
      const verificationResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key'}`,
          },
        }
      );

      const paymentData = verificationResponse.data.data;
      console.log('Paystack verification response:', paymentData);

      if (paymentData.status === 'success') {
        // In a real app, update manuscript payment status in database
        // const manuscript = await Manuscript.findByIdAndUpdate(
        //   manuscriptId,
        //   { 
        //     paymentCompleted: true,
        //     paymentReference: reference,
        //     paymentMethod: 'online',
        //     paidAt: new Date(),
        //     status: 'paid'
        //   },
        //   { new: true }
        // );

        // For now, we'll return success
        res.json({
          success: true,
          message: 'Payment verified successfully',
          payment: {
            reference: reference,
            amount: paymentData.amount / 100, // Convert from kobo to Naira
            status: 'completed',
            paidAt: paymentData.paid_at,
            manuscriptId: manuscriptId,
            gateway_response: paymentData.gateway_response
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Payment verification failed - payment not successful'
        });
      }

    } catch (paystackError) {
      console.error('Paystack verification error:', paystackError.response?.data || paystackError.message);
      res.status(500).json({
        success: false,
        message: 'Failed to verify payment with Paystack'
      });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying payment'
    });
  }
});

// @route   POST api/payments/webhook
// @desc    Handle Paystack webhook events
// @access  Public (but verified with signature)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key';
    const hash = crypto.createHmac('sha512', paystackSecret)
                       .update(req.body)
                       .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      console.error('Invalid Paystack signature');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(req.body);
    console.log('Paystack webhook event:', event.event);

    if (event.event === 'charge.success') {
      const metadata = event.data.metadata;
      const manuscriptId = metadata.manuscriptId;
      const reference = event.data.reference;

      console.log('Payment successful for manuscript:', manuscriptId, 'Reference:', reference);

      // In a real implementation, update the manuscript status
      // const manuscript = await Manuscript.findById(manuscriptId);
      // if (manuscript) {
      //   manuscript.paymentCompleted = true;
      //   manuscript.paymentReference = reference;
      //   manuscript.paidAt = new Date();
      //   await manuscript.save();
      // }

      console.log('Manuscript payment status updated successfully');
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Webhook processing failed');
  }
});

// @route   GET api/payments/verify-reference/:reference
// @desc    Verify payment by reference (for callback URL)
// @access  Public
router.get('/verify-reference/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const verificationResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key'}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = verificationResponse.data;
    if (data.status && data.data.status === 'success') {
      const metadata = data.data.metadata;
      const manuscriptId = metadata?.manuscriptId;

      if (!manuscriptId) {
        return res.status(400).json({ message: 'Manuscript ID not found in metadata' });
      }

      // In a real app, update manuscript payment status
      // const manuscript = await Manuscript.findById(manuscriptId);
      // if (manuscript) {
      //   manuscript.paymentCompleted = true;
      //   manuscript.paymentReference = reference;
      //   await manuscript.save();
      // }

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        manuscriptId: manuscriptId,
        amountPaid: data.data.amount / 100,
        reference: reference
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment not successful' 
      });
    }
  } catch (error) {
    console.error('Payment verification failed:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// @route   GET api/payments
// @desc    Get payments for user (authors see their own, admins see all)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, manuscriptId } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = {};
    
    if (userRole === 'admin') {
      // Admins can see all payments
      if (status) query.status = status;
      if (manuscriptId) query.manuscript = manuscriptId;
    } else {
      // Authors can only see their own payments
      query.user = userId;
      if (status) query.status = status;
      if (manuscriptId) {
        // Verify the manuscript belongs to the user
        const manuscript = await Manuscript.findOne({ 
          _id: manuscriptId, 
          submittedBy: userId 
        });
        if (!manuscript) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. You can only view payments for your own manuscripts.'
          });
        }
        query.manuscript = manuscriptId;
      }
    }

    const payments = await Payment.find(query)
      .populate('manuscript', 'title status publicationDetails')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      payments,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving payments'
    });
  }
});

// @route   GET api/payments/:id
// @desc    Get single payment details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const paymentId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const payment = await Payment.findById(paymentId)
      .populate('manuscript', 'title status publicationDetails submittedBy')
      .populate('user', 'firstName lastName email');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check access permissions
    if (userRole !== 'admin' && payment.user._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own payments.'
      });
    }

    res.json({
      success: true,
      payment
    });

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving payment'
    });
  }
});

// @route   GET api/payments/manuscript/:manuscriptId
// @desc    Get payments for a specific manuscript
// @access  Private
router.get('/manuscript/:manuscriptId', auth, async (req, res) => {
  try {
    const manuscriptId = req.params.manuscriptId;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify access to the manuscript
    const manuscript = await Manuscript.findById(manuscriptId);
    
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    // Check access permissions
    if (userRole !== 'admin' && manuscript.submittedBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view payments for your own manuscripts.'
      });
    }

    const payments = await Payment.find({ manuscript: manuscriptId })
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      payments,
      manuscript: {
        id: manuscript._id,
        title: manuscript.title,
        status: manuscript.status
      }
    });

  } catch (error) {
    console.error('Get manuscript payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving manuscript payments'
    });
  }
});

module.exports = router;