const express = require('express');
const Manuscript = require('../models/Manuscript');
const Review = require('../models/Review');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { sendManuscriptStatusEmail, sendEditorAssignmentEmail } = require('../utils/emailService');

const router = express.Router();

// @route   POST api/editorial/initial-review
// @desc    Editor conducts initial review (desk review)
// @access  Private (Editor/Admin)
router.post('/initial-review/:manuscriptId', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;
    const { decision, editorNotes, internalNotes, revisionInstructions, revisionDeadline } = req.body; // 'send-for-review' or 'desk-reject'
    
    const manuscript = await Manuscript.findById(manuscriptId)
      .populate('submittedBy', 'firstName lastName email');
    
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    if (manuscript.status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Manuscript must be in submitted status for initial review'
      });
    }

    let newStatus, emailStatus;

    if (decision === 'send-for-review') {
      newStatus = 'awaiting-reviewer-assignment';
      emailStatus = 'under-review';
      
      // Add editor notes
      if (editorNotes) {
        manuscript.editorNotes.push({
          note: editorNotes,
          addedBy: req.user.id,
          type: 'editorial-remarks'
        });
      }
      
      if (internalNotes) {
        manuscript.editorNotes.push({
          note: internalNotes,
          addedBy: req.user.id,
          type: 'internal'
        });
      }
      
      if (!editorNotes && !internalNotes) {
        manuscript.editorNotes.push({
          note: 'Manuscript passed initial review and is ready for peer review',
          addedBy: req.user.id,
          type: 'system'
        });
      }
      
    } else if (decision === 'desk-reject') {
      newStatus = 'rejected';
      emailStatus = 'rejected';
      
      // Add editor notes for rejection
      if (editorNotes) {
        manuscript.editorNotes.push({
          note: editorNotes,
          addedBy: req.user.id,
          type: 'editorial-remarks'
        });
      }
      
      if (internalNotes) {
        manuscript.editorNotes.push({
          note: internalNotes,
          addedBy: req.user.id,
          type: 'internal'
        });
      }
      
      if (!editorNotes && !internalNotes) {
        manuscript.editorNotes.push({
          note: 'Manuscript rejected during initial editorial review',
          addedBy: req.user.id,
          type: 'system'
        });
      }
    }

    const oldStatus = manuscript.status;
    manuscript.status = newStatus;
    await manuscript.save();

    // Send email notification to author
    try {
      await sendManuscriptStatusEmail(
        manuscript.submittedBy.email,
        `${manuscript.submittedBy.firstName} ${manuscript.submittedBy.lastName}`,
        manuscript.title,
        oldStatus,
        emailStatus,
        editorNotes, // Editorial remarks
        revisionInstructions, // Revision instructions
        revisionDeadline // Revision deadline
      );
    } catch (emailError) {
      console.error('Email notification error:', emailError);
    }

    res.json({
      success: true,
      message: `Manuscript ${decision === 'send-for-review' ? 'approved for peer review' : 'rejected'}`,
      newStatus: newStatus
    });

  } catch (error) {
    console.error('Initial review error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing initial review'
    });
  }
});

// @route   POST api/editorial/make-decision
// @desc    Editor makes final decision after peer review
// @access  Private (Editor/Admin)
router.post('/make-decision/:manuscriptId', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;
    const { decision, editorNotes, internalNotes, revisionInstructions, revisionDeadline } = req.body; 
    // decision: 'accept', 'minor-revisions', 'major-revisions', 'reject'
    
    const manuscript = await Manuscript.findById(manuscriptId)
      .populate('submittedBy', 'firstName lastName email')
      .populate('reviews');
    
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    // Check if all reviews are completed
    const pendingReviews = await Review.countDocuments({
      manuscript: manuscriptId,
      status: { $in: ['pending', 'accepted'] }
    });

    if (pendingReviews > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot make decision while reviews are still pending'
      });
    }

    let newStatus;
    const statusMap = {
      'accept': 'accepted',
      'minor-revisions': 'revision-requested',
      'major-revisions': 'revision-requested', 
      'reject': 'rejected'
    };

    newStatus = statusMap[decision];
    const oldStatus = manuscript.status;

    // Add editor decision notes
    if (editorNotes) {
      manuscript.editorNotes.push({
        note: editorNotes,
        addedBy: req.user.id,
        type: 'editorial-remarks'
      });
    }
    
    if (internalNotes) {
      manuscript.editorNotes.push({
        note: internalNotes,
        addedBy: req.user.id,
        type: 'internal'
      });
    }
    
    if (revisionInstructions && decision.includes('revisions')) {
      manuscript.editorNotes.push({
        note: `Revision Instructions: ${revisionInstructions}`,
        addedBy: req.user.id,
        type: 'revision-instructions'
      });
    }

    // System note for decision
    manuscript.editorNotes.push({
      note: `Editorial decision: ${decision}`,
      addedBy: req.user.id,
      type: 'system'
    });

    // Set revision deadline if revisions requested
    if (decision.includes('revisions')) {
      if (revisionDeadline) {
        manuscript.revisionDeadline = new Date(revisionDeadline);
      } else {
        // Default to 60 days if no deadline specified
        manuscript.revisionDeadline = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      }
    }

    manuscript.status = newStatus;
    manuscript.editorDecision = {
      decision: decision,
      decidedBy: req.user.id,
      decidedAt: new Date(),
      notes: editorNotes
    };
    
    await manuscript.save();

    // Send email notification to author
    try {
      await sendManuscriptStatusEmail(
        manuscript.submittedBy.email,
        `${manuscript.submittedBy.firstName} ${manuscript.submittedBy.lastName}`,
        manuscript.title,
        oldStatus,
        newStatus,
        editorNotes, // Editorial remarks
        revisionInstructions, // Revision instructions  
        revisionDeadline // Revision deadline
      );
    } catch (emailError) {
      console.error('Email notification error:', emailError);
    }

    res.json({
      success: true,
      message: `Editorial decision recorded: ${decision}`,
      newStatus: newStatus,
      requiresPayment: newStatus === 'accepted'
    });

  } catch (error) {
    console.error('Editorial decision error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing editorial decision'
    });
  }
});

// @route   GET api/editorial/pending-decisions
// @desc    Get manuscripts pending editorial decisions
// @access  Private (Editor/Admin)
router.get('/pending-decisions', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    // Get manuscripts where all reviews are completed but no editorial decision made
    const manuscripts = await Manuscript.find({
      status: 'under-review'
    }).populate('submittedBy', 'firstName lastName email')
      .populate('reviewAssignments.reviewer', 'firstName lastName')
      .sort({ submissionDate: 1 });

    // Filter manuscripts where all reviews are completed
    const readyForDecision = [];
    
    for (const manuscript of manuscripts) {
      const totalReviews = manuscript.reviewAssignments.length;
      const completedReviews = await Review.countDocuments({
        manuscript: manuscript._id,
        status: 'completed'
      });

      if (totalReviews > 0 && completedReviews === totalReviews) {
        // Get review summaries
        const reviews = await Review.find({
          manuscript: manuscript._id,
          status: 'completed'
        }).populate('reviewer', 'firstName lastName')
          .select('recommendation overallScore comments');

        readyForDecision.push({
          ...manuscript.toObject(),
          reviewSummary: {
            totalReviews: totalReviews,
            completedReviews: completedReviews,
            reviews: reviews
          }
        });
      }
    }

    res.json({
      success: true,
      manuscripts: readyForDecision,
      count: readyForDecision.length
    });

  } catch (error) {
    console.error('Get pending decisions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching pending decisions'
    });
  }
});

// @route   POST api/editorial/publish
// @desc    Publish accepted manuscript (after payment)
// @access  Private (Editor/Admin)
router.post('/publish/:manuscriptId', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;
    const { publicationDate, volume, issue, pages } = req.body;
    
    const manuscript = await Manuscript.findById(manuscriptId)
      .populate('submittedBy', 'firstName lastName email');
    
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    if (manuscript.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Only accepted manuscripts can be published'
      });
    }

    // Check if payment is completed (you can add this check)
    // if (!manuscript.paymentCompleted) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Payment must be completed before publication'
    //   });
    // }

    const oldStatus = manuscript.status;
    manuscript.status = 'published';
    manuscript.publicationDetails = {
      publishedDate: publicationDate || new Date(),
      volume: volume,
      issue: issue,
      pages: pages,
      doi: `10.1234/journal.${Date.now()}` // Generate proper DOI
    };
    
    await manuscript.save();

    // Send publication notification to author
    try {
      await sendManuscriptStatusEmail(
        manuscript.submittedBy.email,
        `${manuscript.submittedBy.firstName} ${manuscript.submittedBy.lastName}`,
        manuscript.title,
        oldStatus,
        'published'
      );
    } catch (emailError) {
      console.error('Email notification error:', emailError);
    }

    res.json({
      success: true,
      message: 'Manuscript published successfully',
      publicationDetails: manuscript.publicationDetails
    });

  } catch (error) {
    console.error('Publication error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error publishing manuscript'
    });
  }
});

// @route   POST api/editorial/assign-editor
// @desc    Assign manuscript to editor
// @access  Private (Admin)
router.post('/assign-editor/:manuscriptId', auth, authorize('admin'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;
    const { editorId } = req.body;

    const manuscript = await Manuscript.findById(manuscriptId);
    const editor = await User.findById(editorId);

    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    if (!editor || editor.role !== 'editor') {
      return res.status(400).json({
        success: false,
        message: 'Invalid editor selected'
      });
    }

    // Assign editor to manuscript
    console.log('🔍 DEBUG: Assigning editor:', editorId, 'to manuscript:', manuscriptId);
    manuscript.assignedEditor = editorId;
    manuscript.editorNotes.push({
      note: `Manuscript assigned to editor: ${editor.firstName} ${editor.lastName}`,
      addedBy: req.user.id
    });

    await manuscript.save();
    console.log('🔍 DEBUG: Manuscript saved with assignedEditor:', manuscript.assignedEditor);

    // Send notification to editor (if email service is configured)
    try {
      await sendEditorAssignmentEmail(
        editor.email,
        `${editor.firstName} ${editor.lastName}`,
        manuscript.title,
        manuscript._id
      );
    } catch (emailError) {
      console.log('Email notification failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Editor assigned successfully',
      manuscript: {
        id: manuscript._id,
        title: manuscript.title,
        assignedEditor: {
          id: editor._id,
          name: `${editor.firstName} ${editor.lastName}`,
          email: editor.email
        }
      }
    });

  } catch (error) {
    console.error('Editor assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error assigning editor'
    });
  }
});

// @route   POST api/editorial/submit-back
// @desc    Submit manuscript back to author for corrections
// @access  Private (Editor/Admin)
router.post('/submit-back/:manuscriptId', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;
    const { editorRemarks, internalNotes, revisionInstructions, revisionDeadline } = req.body;
    
    const manuscript = await Manuscript.findById(manuscriptId)
      .populate('submittedBy', 'firstName lastName email');
    
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    // Add editor notes
    if (editorRemarks) {
      manuscript.editorNotes.push({
        note: editorRemarks,
        addedBy: req.user.id,
        type: 'editorial-remarks'
      });
    }
    
    if (internalNotes) {
      manuscript.editorNotes.push({
        note: internalNotes,
        addedBy: req.user.id,
        type: 'internal'
      });
    }
    
    if (revisionInstructions) {
      manuscript.editorNotes.push({
        note: `Revision Instructions: ${revisionInstructions}`,
        addedBy: req.user.id,
        type: 'revision-instructions'
      });
    }

    // System note
    manuscript.editorNotes.push({
      note: 'Manuscript submitted back to author for revisions',
      addedBy: req.user.id,
      type: 'system'
    });

    // Set status and deadline
    const oldStatus = manuscript.status;
    manuscript.status = 'submitted-back';
    
    if (revisionDeadline) {
      manuscript.revisionDeadline = new Date(revisionDeadline);
    } else {
      manuscript.revisionDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default
    }
    
    await manuscript.save();

    // Send email notification to author
    try {
      await sendManuscriptStatusEmail(
        manuscript.submittedBy.email,
        `${manuscript.submittedBy.firstName} ${manuscript.submittedBy.lastName}`,
        manuscript.title,
        oldStatus,
        'submitted-back',
        editorRemarks, // Editorial remarks
        revisionInstructions, // Revision instructions
        manuscript.revisionDeadline // Revision deadline
      );
    } catch (emailError) {
      console.error('Email notification error:', emailError);
    }

    res.json({
      success: true,
      message: 'Manuscript submitted back to author successfully',
      newStatus: 'submitted-back'
    });

  } catch (error) {
    console.error('Submit back error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting manuscript back to author'
    });
  }
});

// @route   GET api/editorial/editor-manuscripts
// @desc    Get manuscripts assigned to logged-in editor
// @access  Private (Editor/Admin)
router.get('/editor-manuscripts', auth, async (req, res) => {
  try {
    console.log('🔍 DEBUG: Getting manuscripts for editor:', req.user.id, 'Role:', req.user.role);
    
    // First, let's see all manuscripts with assignedEditor field
    const allAssignedManuscripts = await Manuscript.find({ 
      assignedEditor: { $exists: true, $ne: null } 
    }).populate('assignedEditor', 'firstName lastName email');
    
    console.log('🔍 DEBUG: All manuscripts with assigned editors:', allAssignedManuscripts.length);
    allAssignedManuscripts.forEach(m => {
      console.log('🔍 DEBUG: Manuscript:', m.title, 'assigned to:', m.assignedEditor?._id, 'looking for:', req.user.id);
    });
    
    // Now find manuscripts for this specific editor
    const mongoose = require('mongoose');
    const editorObjectId = new mongoose.Types.ObjectId(req.user.id);
    
    const manuscripts = await Manuscript.find({ 
      assignedEditor: editorObjectId 
    })
    .populate('submittedBy', 'firstName lastName email')
    .populate('assignedEditor', 'firstName lastName email')
    .populate({
      path: 'reviews',
      populate: {
        path: 'reviewer',
        select: 'firstName lastName email'
      }
    })
    .sort({ submittedDate: -1 });

    // Get review statistics for each manuscript
    const manuscriptsWithStats = await Promise.all(
      manuscripts.map(async (manuscript) => {
        const reviews = await Review.find({ manuscript: manuscript._id });
        const completedReviews = reviews.filter(r => r.status === 'completed');
        const pendingReviews = reviews.filter(r => r.status === 'pending');
        
        return {
          ...manuscript.toObject(),
          reviewStats: {
            total: reviews.length,
            completed: completedReviews.length,
            pending: pendingReviews.length,
            averageScore: completedReviews.length > 0 
              ? completedReviews.reduce((sum, r) => sum + (r.overallScore || 0), 0) / completedReviews.length 
              : null
          }
        };
      })
    );

    console.log('🔍 DEBUG: Found manuscripts:', manuscripts.length);
    console.log('🔍 DEBUG: Manuscripts with stats:', manuscriptsWithStats.length);
    
    if (manuscripts.length > 0) {
      console.log('🔍 DEBUG: First manuscript:', {
        id: manuscripts[0]._id,
        title: manuscripts[0].title,
        status: manuscripts[0].status,
        assignedEditor: manuscripts[0].assignedEditor
      });
    }

    res.json({
      success: true,
      manuscripts: manuscriptsWithStats,
      totalCount: manuscripts.length
    });

  } catch (error) {
    console.error('Error fetching editor manuscripts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching manuscripts'
    });
  }
});

// @route   GET api/editorial/debug-manuscripts
// @desc    Debug route to check all manuscripts with assigned editors
// @access  Private (Admin)
router.get('/debug-manuscripts', auth, authorize('admin'), async (req, res) => {
  try {
    const allManuscripts = await Manuscript.find({})
      .populate('assignedEditor', 'firstName lastName email role')
      .select('title assignedEditor status')
      .sort({ submittedDate: -1 });

    const assignedManuscripts = allManuscripts.filter(m => m.assignedEditor);

    console.log('🔍 DEBUG: All manuscripts:', allManuscripts.length);
    console.log('🔍 DEBUG: Manuscripts with assigned editors:', assignedManuscripts.length);
    
    res.json({
      success: true,
      totalManuscripts: allManuscripts.length,
      assignedManuscripts: assignedManuscripts.length,
      manuscripts: assignedManuscripts.map(m => ({
        id: m._id,
        title: m.title,
        status: m.status,
        assignedEditor: m.assignedEditor
      }))
    });

  } catch (error) {
    console.error('Error in debug route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in debug route'
    });
  }
});

// @route   GET api/editorial/test-editor
// @desc    Test route to verify editor can access API
// @access  Private
router.get('/test-editor', auth, async (req, res) => {
  try {
    console.log('🔍 DEBUG: Test route accessed by user:', req.user.id, 'Role:', req.user.role);
    
    // Check if this user has assigned manuscripts
    const assignedManuscripts = await Manuscript.find({ assignedEditor: req.user.id })
      .select('title status')
      .limit(5);
    
    console.log('🔍 DEBUG: Found assigned manuscripts:', assignedManuscripts.length);
    
    res.json({
      success: true,
      message: 'Editor API access working',
      user: {
        id: req.user.id,
        role: req.user.role
      },
      assignedManuscriptsCount: assignedManuscripts.length,
      assignedManuscripts: assignedManuscripts,
      testManuscripts: [
        {
          _id: 'test123',
          title: 'Test Manuscript',
          status: 'submitted',
          submittedBy: { firstName: 'Test', lastName: 'Author', email: 'test@example.com' },
          reviewStats: { total: 0, completed: 0, pending: 0 }
        }
      ]
    });

  } catch (error) {
    console.error('Error in test route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in test route'
    });
  }
});

// @route   GET api/editorial/check-user-role
// @desc    Check what role the current user actually has
// @access  Private
router.get('/check-user-role', auth, async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking role for user ID:', req.user.id);
    
    // Get the full user details from database
    const userFromDB = await User.findById(req.user.id).select('firstName lastName email role');
    
    console.log('🔍 DEBUG: User from token:', req.user);
    console.log('🔍 DEBUG: User from database:', userFromDB);
    
    res.json({
      success: true,
      tokenUser: req.user,
      databaseUser: userFromDB,
      rolesMatch: req.user.role === userFromDB?.role
    });

  } catch (error) {
    console.error('Error checking user role:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking role'
    });
  }
});

// @route   GET api/editorial/published-articles
// @desc    Get all published articles for public viewing
// @access  Public
router.get('/published-articles', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      sortBy = 'publishedDate',
      sortOrder = 'desc',
      volume,
      issue,
      year 
    } = req.query;

    // Build query
    let query = { status: 'published' };
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { abstract: { $regex: search, $options: 'i' } },
        { keywords: { $elemMatch: { $regex: search, $options: 'i' } } }
      ];
    }

    if (volume) {
      query['publicationDetails.volume'] = parseInt(volume);
    }

    if (issue) {
      query['publicationDetails.issue'] = parseInt(issue);
    }

    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      query['publicationDetails.publishedDate'] = {
        $gte: startDate,
        $lte: endDate
      };
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy === 'publishedDate' ? 'publicationDetails.publishedDate' : sortBy] = sortOrder === 'desc' ? -1 : 1;

    const articles = await Manuscript.find(query)
      .populate('submittedBy', 'firstName lastName email institution')
      .populate('reviews', 'rating')
      .select('-editorNotes -internalNotes -reviews.comments -reviews.confidentialComments')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Manuscript.countDocuments(query);

    // Get unique volumes and issues for filtering
    const volumesIssues = await Manuscript.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: {
            volume: '$publicationDetails.volume',
            issue: '$publicationDetails.issue',
            year: { $year: '$publicationDetails.publishedDate' }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.volume': -1, '_id.issue': -1 } }
    ]);

    res.json({
      success: true,
      articles: articles,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total: total
      },
      filters: {
        volumes: [...new Set(volumesIssues.map(vi => vi._id.volume))].filter(Boolean),
        issues: [...new Set(volumesIssues.map(vi => vi._id.issue))].filter(Boolean),
        years: [...new Set(volumesIssues.map(vi => vi._id.year))].filter(Boolean)
      }
    });

  } catch (error) {
    console.error('Get published articles error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving published articles'
    });
  }
});

// @route   GET api/editorial/article/:id
// @desc    Get single published article details
// @access  Public
router.get('/article/:id', async (req, res) => {
  try {
    const article = await Manuscript.findOne({ 
      _id: req.params.id, 
      status: 'published' 
    })
      .populate('submittedBy', 'firstName lastName email institution')
      .select('-editorNotes -internalNotes');

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Published article not found'
      });
    }

    // Increment view count
    article.metrics = article.metrics || {};
    article.metrics.views = (article.metrics.views || 0) + 1;
    await article.save();

    res.json({
      success: true,
      article: article
    });

  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving article'
    });
  }
});

// @route   POST api/editorial/article/:id/download
// @desc    Track article download
// @access  Public
router.post('/article/:id/download', async (req, res) => {
  try {
    const article = await Manuscript.findOne({ 
      _id: req.params.id, 
      status: 'published' 
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Published article not found'
      });
    }

    // Increment download count
    article.metrics = article.metrics || {};
    article.metrics.downloads = (article.metrics.downloads || 0) + 1;
    await article.save();

    res.json({
      success: true,
      message: 'Download tracked'
    });

  } catch (error) {
    console.error('Track download error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error tracking download'
    });
  }
});

// @route   POST api/editorial/article/:id/share
// @desc    Track article share
// @access  Public
router.post('/article/:id/share', async (req, res) => {
  try {
    const article = await Manuscript.findOne({ 
      _id: req.params.id, 
      status: 'published' 
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Published article not found'
      });
    }

    // Increment share count
    article.metrics = article.metrics || {};
    article.metrics.shares = (article.metrics.shares || 0) + 1;
    await article.save();

    res.json({
      success: true,
      message: 'Share tracked'
    });

  } catch (error) {
    console.error('Track share error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error tracking share'
    });
  }
});

module.exports = router;