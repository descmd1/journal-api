const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const Manuscript = require('../models/Manuscript');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/tiff'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Please upload PDF, DOC, DOCX, or image files.'), false);
    }
  }
});

// @route   POST api/manuscripts
// @desc    Create a new manuscript
// @access  Private
router.post('/', auth, upload.array('files', 10), [
  body('title', 'Title is required').notEmpty().trim(),
  body('abstract', 'Abstract is required').notEmpty().trim(),
  body('category', 'Category is required').notEmpty(),
  body('manuscriptType', 'Manuscript type is required').notEmpty(),
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

    const {
      title,
      abstract,
      keywords,
      authors,
      category,
      subCategory,
      manuscriptType,
      funding,
      ethics
    } = req.body;

    // Parse keywords and authors if they're strings
    const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;
    const parsedAuthors = typeof authors === 'string' ? JSON.parse(authors) : authors;
    const parsedFunding = typeof funding === 'string' ? JSON.parse(funding) : funding;
    const parsedEthics = typeof ethics === 'string' ? JSON.parse(ethics) : ethics;

    // Process uploaded files
    const files = req.files ? req.files.map((file, index) => ({
      filename: `${Date.now()}-${file.originalname}`,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `uploads/${Date.now()}-${file.originalname}`, // This would be replaced with actual cloud storage URL
      fileType: index === 0 ? 'manuscript' : 'supplementary'
    })) : [];

    // Create manuscript
    const manuscript = new Manuscript({
      title,
      abstract,
      keywords: parsedKeywords || [],
      authors: parsedAuthors || [],
      submittedBy: req.user.id,
      category,
      subCategory,
      manuscriptType,
      files,
      funding: parsedFunding || { hasFunding: false },
      ethics: parsedEthics || { ethicalApproval: false, conflictOfInterest: false },
      status: 'draft'
    });

    await manuscript.save();

    // Add manuscript to user's created manuscripts
    await User.findByIdAndUpdate(
      req.user.id,
      { $push: { createdManuscripts: manuscript._id } }
    );

    res.status(201).json({
      success: true,
      message: 'Manuscript created successfully',
      manuscript
    });

  } catch (error) {
    console.error('Create manuscript error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating manuscript',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET api/manuscripts
// @desc    Get user's manuscripts
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const search = req.query.search;

    // Build query
    const query = { submittedBy: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    const manuscripts = await Manuscript.find(query)
      .populate('submittedBy', 'firstName lastName email')
      .populate('reviews')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Manuscript.countDocuments(query);

    res.json({
      success: true,
      manuscripts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalManuscripts: total
    });

  } catch (error) {
    console.error('Get manuscripts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching manuscripts'
    });
  }
});

// @route   GET api/manuscripts/:id
// @desc    Get single manuscript
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const manuscript = await Manuscript.findById(req.params.id)
      .populate('submittedBy', 'firstName lastName email institution')
      .populate('reviews')
      .populate('reviewAssignments.reviewer', 'firstName lastName email');

    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    // Check if user has permission to view this manuscript
    const canView = (
      manuscript.submittedBy._id.toString() === req.user.id ||
      ['editor', 'admin'].includes(req.user.role) ||
      manuscript.reviewAssignments.some(assignment => 
        assignment.reviewer._id.toString() === req.user.id
      )
    );

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this manuscript'
      });
    }

    res.json({
      success: true,
      manuscript
    });

  } catch (error) {
    console.error('Get manuscript error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching manuscript'
    });
  }
});

// @route   PUT api/manuscripts/:id
// @desc    Update manuscript
// @access  Private
router.put('/:id', auth, upload.array('files', 10), [
  body('title', 'Title is required').optional().notEmpty().trim(),
  body('abstract', 'Abstract is required').optional().notEmpty().trim(),
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

    const manuscript = await Manuscript.findById(req.params.id);

    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    // Check if user owns the manuscript and it's editable
    if (manuscript.submittedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to edit this manuscript'
      });
    }

    if (!['draft', 'revision-requested'].includes(manuscript.status)) {
      return res.status(400).json({
        success: false,
        message: 'Manuscript cannot be edited in current status'
      });
    }

    const updateFields = {};
    const allowedFields = [
      'title', 'abstract', 'keywords', 'authors', 'category', 
      'subCategory', 'manuscriptType', 'funding', 'ethics'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] === 'string' && ['keywords', 'authors', 'funding', 'ethics'].includes(field)) {
          try {
            updateFields[field] = JSON.parse(req.body[field]);
          } catch (e) {
            updateFields[field] = req.body[field];
          }
        } else {
          updateFields[field] = req.body[field];
        }
      }
    });

    // Handle new file uploads
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map((file, index) => ({
        filename: `${Date.now()}-${file.originalname}`,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: `uploads/${Date.now()}-${file.originalname}`,
        fileType: index === 0 ? 'manuscript' : 'supplementary'
      }));
      
      updateFields.$push = { files: { $each: newFiles } };
    }

    const updatedManuscript = await Manuscript.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('submittedBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Manuscript updated successfully',
      manuscript: updatedManuscript
    });

  } catch (error) {
    console.error('Update manuscript error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating manuscript'
    });
  }
});

// @route   POST api/manuscripts/:id/submit
// @desc    Submit manuscript for review
// @access  Private
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const manuscript = await Manuscript.findById(req.params.id);

    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    if (manuscript.submittedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to submit this manuscript'
      });
    }

    if (manuscript.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Manuscript is not in draft status'
      });
    }

    // Validate required fields
    if (!manuscript.title || !manuscript.abstract || !manuscript.files.length) {
      return res.status(400).json({
        success: false,
        message: 'Manuscript must have title, abstract, and at least one file'
      });
    }

    manuscript.status = 'submitted';
    manuscript.submissionDate = new Date();
    await manuscript.save();

    res.json({
      success: true,
      message: 'Manuscript submitted successfully',
      manuscript
    });

  } catch (error) {
    console.error('Submit manuscript error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting manuscript'
    });
  }
});

// @route   GET api/manuscripts/admin/all
// @desc    Get all manuscripts (admin/editor view)
// @access  Private (Editor/Admin)
router.get('/admin/all', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const category = req.query.category;
    const search = req.query.search;

    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    const manuscripts = await Manuscript.find(query)
      .populate('submittedBy', 'firstName lastName email institution')
      .populate('reviewAssignments.reviewer', 'firstName lastName')
      .sort({ submissionDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Manuscript.countDocuments(query);
    
    // Get statistics
    const stats = await Manuscript.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      manuscripts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalManuscripts: total,
      statistics: stats
    });

  } catch (error) {
    console.error('Get all manuscripts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching manuscripts'
    });
  }
});

// @route   PUT api/manuscripts/:id/status
// @desc    Update manuscript status (admin/editor only)
// @access  Private (Admin/Editor)
router.put('/:id/status', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { status } = req.body;
    
    const validStatuses = [
      'draft',
      'submitted', 
      'under-review',
      'revision-requested',
      'revised',
      'accepted',
      'rejected',
      'published',
      'withdrawn'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status provided'
      });
    }

    const manuscript = await Manuscript.findById(req.params.id);
    
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    manuscript.status = status;
    manuscript.lastModified = new Date();

    // Set submission date if moving to submitted status
    if (status === 'submitted' && !manuscript.submissionDate) {
      manuscript.submissionDate = new Date();
    }

    await manuscript.save();

    res.json({
      success: true,
      message: 'Manuscript status updated successfully',
      manuscript: {
        id: manuscript._id,
        status: manuscript.status,
        lastModified: manuscript.lastModified
      }
    });

  } catch (error) {
    console.error('Update manuscript status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating manuscript status'
    });
  }
});

module.exports = router;