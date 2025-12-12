const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/users/profile/:id
// @desc    Get user profile by ID
// @access  Private
router.get('/profile/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires -verificationToken')
      .populate('createdManuscripts', 'title status submissionDate')
      .populate('reviewAssignments');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user profile'
    });
  }
});

// @route   GET api/users/reviewers
// @desc    Get list of potential reviewers
// @access  Private (Editor/Admin)
router.get('/reviewers', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { expertise, search, page = 1, limit = 20 } = req.query;
    
    const query = { 
      role: { $in: ['reviewer', 'editor'] },
      isActive: true 
    };
    
    if (expertise) {
      query.expertise = { $in: [expertise] };
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { institution: { $regex: search, $options: 'i' } }
      ];
    }

    const reviewers = await User.find(query)
      .select('firstName lastName email institution expertise orcidId')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      reviewers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalReviewers: total
    });

  } catch (error) {
    console.error('Get reviewers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching reviewers'
    });
  }
});

// @route   GET api/users/search
// @desc    Search users
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const { query, role, page = 1, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchQuery = {
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { institution: { $regex: query, $options: 'i' } }
      ],
      isActive: true
    };
    
    if (role) {
      searchQuery.role = role;
    }

    const users = await User.find(searchQuery)
      .select('firstName lastName email institution role expertise')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(searchQuery);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalUsers: total
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error searching users'
    });
  }
});

module.exports = router;