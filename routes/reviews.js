const express = require('express');
const { body, validationResult } = require('express-validator');
const Review = require('../models/Review');
const Manuscript = require('../models/Manuscript');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { sendReviewerAssignmentEmail } = require('../utils/emailService');

const router = express.Router();

// @route   POST api/reviews/assign
// @desc    Assign reviewers to manuscript
// @access  Private (Editor/Admin)
router.post('/assign', auth, authorize('editor', 'admin'), [
  body('manuscriptId', 'Manuscript ID is required').notEmpty(),
  body('reviewerIds', 'At least one reviewer ID is required').isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { manuscriptId, reviewerIds, dueDate } = req.body;

    console.log('🔍 DEBUG: Assignment request:', {
      manuscriptId,
      reviewerIds,
      assignedBy: req.user.id,
      assignedByRole: req.user.role
    });

    // Check if manuscript exists
    const manuscript = await Manuscript.findById(manuscriptId);
    if (!manuscript) {
      console.log('🔍 DEBUG: Manuscript not found:', manuscriptId);
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    console.log('🔍 DEBUG: Found manuscript:', manuscript.title);

    // Set default due date (30 days from now)
    const reviewDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const assignedReviews = [];

    for (const reviewerId of reviewerIds) {
      console.log('🔍 DEBUG: Processing reviewer ID:', reviewerId);
      
      // Check if reviewer exists
      const reviewer = await User.findById(reviewerId);
      if (!reviewer) {
        console.log('🔍 DEBUG: Reviewer not found:', reviewerId);
        continue; // Skip invalid reviewer IDs
      }

      console.log('🔍 DEBUG: Found reviewer:', reviewer.firstName, reviewer.lastName, 'Role:', reviewer.role);

      // Check if reviewer is already assigned to this manuscript
      const existingReview = await Review.findOne({
        manuscript: manuscriptId,
        reviewer: reviewerId
      });

      if (existingReview) {
        console.log('🔍 DEBUG: Review already exists for this reviewer and manuscript');
        assignedReviews.push(existingReview);
        continue;
      }

      console.log('🔍 DEBUG: Creating new review assignment');

      // Create new review assignment
      const review = new Review({
        manuscript: manuscriptId,
        reviewer: reviewerId,
        assignedBy: req.user.id,
        dueDate: reviewDueDate
      });

      await review.save();
      console.log('🔍 DEBUG: Review saved with ID:', review._id);

      // Update manuscript with review assignment
      await Manuscript.findByIdAndUpdate(manuscriptId, {
        $push: {
          reviewAssignments: {
            reviewer: reviewerId,
            assignedDate: new Date(),
            dueDate: reviewDueDate,
            status: 'pending'
          }
        }
      });

      // Add to user's review assignments
      await User.findByIdAndUpdate(reviewerId, {
        $push: { reviewAssignments: review._id }
      });

      // Send email notification to reviewer
      try {
        const emailResult = await sendReviewerAssignmentEmail(
          reviewer.email,
          `${reviewer.firstName} ${reviewer.lastName}`,
          manuscript.title,
          manuscript._id,
          reviewDueDate
        );
        
        if (emailResult.success) {
          console.log(`✅ Review assignment email sent to ${reviewer.email}`);
        } else {
          console.error(`❌ Failed to send email to ${reviewer.email}:`, emailResult.error);
        }
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // Don't fail the assignment if email fails
      }

      assignedReviews.push(review);
    }    // Update manuscript status
    if (assignedReviews.length > 0) {
      await Manuscript.findByIdAndUpdate(manuscriptId, {
        status: 'under-review'
      });
    }

    console.log('🔍 DEBUG: Final assignment result - Total assigned:', assignedReviews.length);

    res.json({
      success: true,
      message: `${assignedReviews.length} reviewer(s) assigned successfully`,
      assignedReviews: assignedReviews.length
    });

  } catch (error) {
    console.error('🔍 DEBUG: Assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error assigning reviewers'
    });
  }
});

// @route   GET api/reviews/debug-all
// @desc    Get all reviews for debugging (admin only)
// @access  Private (Admin)
router.get('/debug-all', auth, authorize('admin'), async (req, res) => {
  try {
    const allReviews = await Review.find({})
      .populate('manuscript', 'title')
      .populate('reviewer', 'firstName lastName email')
      .populate('assignedBy', 'firstName lastName');
    
    console.log('🔍 DEBUG: All reviews in database:', allReviews.length);
    
    res.json({
      success: true,
      totalReviews: allReviews.length,
      reviews: allReviews
    });
  } catch (error) {
    console.error('Debug all reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET api/reviews/my-assignments
// @desc    Get reviewer's assigned manuscripts
// @access  Private (Reviewer)
router.get('/my-assignments', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    console.log('🔍 DEBUG: My-assignments request from user:', req.user.id, 'role:', req.user.role);
    console.log('🔍 DEBUG: User object:', JSON.stringify(req.user, null, 2));
    
    const query = { reviewer: req.user.id };
    if (status) {
      query.status = status;
    }
    
    console.log('🔍 DEBUG: Query for reviews:', query);
    
    // Let's also check all reviews and see if any match this user
    const allReviewsForComparison = await Review.find({}).populate('reviewer', 'firstName lastName email');
    console.log('🔍 DEBUG: All reviews with reviewer info:', allReviewsForComparison.map(r => ({
      reviewId: r._id,
      reviewerIdInDB: r.reviewer?._id?.toString(),
      reviewerEmail: r.reviewer?.email,
      queryUserId: req.user.id,
      queryUserEmail: req.user.email,
      idMatch: r.reviewer?._id?.toString() === req.user.id,
      emailMatch: r.reviewer?.email === req.user.email
    })));

    // Also try finding by email as backup
    const user = await User.findById(req.user.id);
    console.log('🔍 DEBUG: Current user from DB:', {
      id: user?._id?.toString(),
      email: user?.email,
      role: user?.role
    });

    const reviews = await Review.find(query)
      .populate({
        path: 'manuscript',
        select: 'title abstract category manuscriptType submissionDate',
        populate: {
          path: 'submittedBy',
          select: 'firstName lastName institution'
        }
      })
      .populate('assignedBy', 'firstName lastName')
      .sort({ assignedDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    console.log('🔍 DEBUG: Found reviews:', reviews.length);
    console.log('🔍 DEBUG: Review details:', reviews.map(r => ({
      id: r._id,
      manuscript: r.manuscript?.title,
      reviewer: r.reviewer,
      status: r.status
    })));

    const total = await Review.countDocuments(query);
    
    console.log('🔍 DEBUG: Total reviews for user:', total);

    res.json({
      success: true,
      reviews,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalReviews: total
    });

  } catch (error) {
    console.error('Get reviewer assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching review assignments'
    });
  }
});

// @route   GET api/reviews/:id
// @desc    Get single review
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate({
        path: 'manuscript',
        populate: {
          path: 'submittedBy',
          select: 'firstName lastName institution'
        }
      })
      .populate('reviewer', 'firstName lastName institution')
      .populate('assignedBy', 'firstName lastName');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check permissions
    const canAccess = (
      review.reviewer._id.toString() === req.user.id ||
      review.assignedBy._id.toString() === req.user.id ||
      ['editor', 'admin'].includes(req.user.role)
    );

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this review'
      });
    }

    res.json({
      success: true,
      review
    });

  } catch (error) {
    console.error('Get review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching review'
    });
  }
});

// @route   PUT api/reviews/:id/submit
// @desc    Submit review
// @access  Private (Reviewer)
router.put('/:id/submit', auth, [
  body('recommendation', 'Recommendation is required').isIn(['accept', 'minor-revision', 'major-revision', 'reject']),
  body('evaluation', 'Evaluation is required').isObject(),
  body('strengths', 'Strengths are required').notEmpty(),
  body('weaknesses', 'Weaknesses are required').notEmpty(),
  body('specificComments', 'Specific comments are required').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user is the assigned reviewer
    if (review.reviewer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to submit this review'
      });
    }

    if (review.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Review has already been submitted'
      });
    }

    const {
      recommendation,
      evaluation,
      confidenceLevel,
      strengths,
      weaknesses,
      specificComments,
      confidentialComments,
      suggestedReviewers
    } = req.body;

    // Update review
    review.recommendation = recommendation;
    review.evaluation = evaluation;
    review.confidenceLevel = confidenceLevel;
    review.strengths = strengths;
    review.weaknesses = weaknesses;
    review.specificComments = specificComments;
    review.confidentialComments = confidentialComments;
    review.suggestedReviewers = suggestedReviewers || [];
    review.status = 'completed';
    review.submittedDate = new Date();

    await review.save();

    // Update manuscript review assignment status
    await Manuscript.findOneAndUpdate(
      { 
        _id: review.manuscript,
        'reviewAssignments.reviewer': review.reviewer
      },
      {
        $set: { 'reviewAssignments.$.status': 'completed' }
      }
    );

    // Add review to manuscript's reviews array
    await Manuscript.findByIdAndUpdate(review.manuscript, {
      $addToSet: { reviews: review._id }
    });

    res.json({
      success: true,
      message: 'Review submitted successfully',
      review
    });

  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting review'
    });
  }
});

// @route   POST api/reviews/:id/accept
// @desc    Accept review assignment
// @access  Private (Reviewer)
router.post('/:id/accept', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review assignment not found'
      });
    }

    if (review.reviewer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this review'
      });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Review assignment cannot be accepted in current status'
      });
    }

    review.status = 'in-progress';
    await review.save();

    // Update manuscript review assignment status
    await Manuscript.findOneAndUpdate(
      { 
        _id: review.manuscript,
        'reviewAssignments.reviewer': review.reviewer
      },
      {
        $set: { 'reviewAssignments.$.status': 'accepted' }
      }
    );

    res.json({
      success: true,
      message: 'Review assignment accepted successfully'
    });

  } catch (error) {
    console.error('Accept review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error accepting review assignment'
    });
  }
});

// @route   POST api/reviews/:id/decline
// @desc    Decline review assignment
// @access  Private (Reviewer)
router.post('/:id/decline', auth, [
  body('reason', 'Reason for declining is required').notEmpty()
], async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review assignment not found'
      });
    }

    if (review.reviewer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to decline this review'
      });
    }

    if (review.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Review assignment cannot be declined in current status'
      });
    }

    // Remove review assignment
    await Review.findByIdAndDelete(req.params.id);

    // Update manuscript review assignments
    await Manuscript.findByIdAndUpdate(review.manuscript, {
      $pull: { 
        reviewAssignments: { reviewer: review.reviewer }
      }
    });

    // Remove from user's review assignments
    await User.findByIdAndUpdate(review.reviewer, {
      $pull: { reviewAssignments: review._id }
    });

    res.json({
      success: true,
      message: 'Review assignment declined successfully'
    });

  } catch (error) {
    console.error('Decline review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error declining review assignment'
    });
  }
});

// @route   POST api/reviews/:reviewId/submit
// @desc    Submit review evaluation
// @access  Private (Reviewer)
router.post('/:reviewId/submit', auth, [
  body('recommendation', 'Recommendation is required').isIn(['accept', 'minor-revision', 'major-revision', 'reject']),
  body('comments', 'Comments for authors are required').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { reviewId } = req.params;
    const {
      recommendation,
      originality,
      methodology,
      significance,
      clarity,
      comments,
      confidentialComments
    } = req.body;

    // Find the review and verify it belongs to the current user
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.reviewer.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to submit this review'
      });
    }

    if (review.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Review has already been submitted'
      });
    }

    // Update the review with evaluation
    review.recommendation = recommendation;
    review.evaluation = {
      originality: { score: originality },
      methodology: { score: methodology },
      significance: { score: significance },
      clarity: { score: clarity }
    };
    review.comments = comments;
    review.confidentialComments = confidentialComments;
    review.submittedDate = new Date();
    review.status = 'completed';

    await review.save();

    // Update manuscript status if needed
    const manuscript = await Manuscript.findById(review.manuscript);
    if (manuscript) {
      // Check if all reviews are completed
      const allReviews = await Review.find({ manuscript: review.manuscript });
      const completedReviews = allReviews.filter(r => r.status === 'completed');
      
      if (completedReviews.length === allReviews.length) {
        manuscript.status = 'reviewed';
        await manuscript.save();
      }
    }

    res.json({
      success: true,
      message: 'Review submitted successfully',
      review: {
        id: review._id,
        status: review.status,
        recommendation: review.recommendation,
        submittedDate: review.submittedDate
      }
    });

  } catch (error) {
    console.error('Review submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting review'
    });
  }
});

// @route   GET api/reviews/debug/all
// @desc    Get all reviews for debugging (Admin only)
// @access  Private (Admin)
router.get('/debug/all', auth, authorize('admin'), async (req, res) => {
  try {
    console.log('🔍 DEBUG: Fetching all reviews for debugging...');
    
    const allReviews = await Review.find({})
      .populate('manuscript', 'title')
      .populate('reviewer', 'firstName lastName email role')
      .populate('assignedBy', 'firstName lastName')
      .sort({ assignedDate: -1 });

    console.log('🔍 DEBUG: Total reviews in database:', allReviews.length);
    
    const reviewSummary = allReviews.map(review => ({
      id: review._id,
      manuscript: review.manuscript?.title || 'No manuscript',
      reviewer: review.reviewer ? `${review.reviewer.firstName} ${review.reviewer.lastName} (${review.reviewer.email})` : 'No reviewer',
      reviewerRole: review.reviewer?.role,
      status: review.status,
      assignedDate: review.assignedDate
    }));

    console.log('🔍 DEBUG: Review summary:', reviewSummary);

    res.json({
      success: true,
      totalReviews: allReviews.length,
      reviews: reviewSummary
    });

  } catch (error) {
    console.error('🔍 DEBUG: Error fetching all reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews for debugging'
    });
  }
});

module.exports = router;