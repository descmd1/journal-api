const express = require('express');
const User = require('../models/User');
const Manuscript = require('../models/Manuscript');
const Review = require('../models/Review');
const Journal = require('../models/Journal');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private (Admin)
router.get('/dashboard', auth, adminOnly, async (req, res) => {
  try {
    // Get user statistics
    const userStats = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Get manuscript statistics
    const manuscriptStats = await Manuscript.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get category statistics
    const categoryStats = await Manuscript.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Get monthly submission statistics
    const monthlyStats = await Manuscript.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$submissionDate' },
            month: { $month: '$submissionDate' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // Get review statistics
    const reviewStats = await Review.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get recent activities
    const recentManuscripts = await Manuscript.find()
      .populate('submittedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('title status submissionDate submittedBy');

    const recentReviews = await Review.find()
      .populate('reviewer', 'firstName lastName')
      .populate('manuscript', 'title')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('manuscript reviewer status assignedDate');

    // Calculate totals
    const totals = {
      users: await User.countDocuments(),
      manuscripts: await Manuscript.countDocuments(),
      reviews: await Review.countDocuments(),
      journals: await Journal.countDocuments(),
      activeUsers: await User.countDocuments({ isActive: true }),
      pendingReviews: await Review.countDocuments({ status: 'pending' })
    };

    res.json({
      success: true,
      statistics: {
        totals,
        userStats,
        manuscriptStats,
        categoryStats,
        monthlyStats,
        reviewStats
      },
      recentActivities: {
        manuscripts: recentManuscripts,
        reviews: recentReviews
      }
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching dashboard data'
    });
  }
});

// @route   GET api/admin/users
// @desc    Get all users (admin view)
// @access  Private (Admin)
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    
    const query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (status) {
      query.isActive = status === 'active';
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { institution: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalUsers: total
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users'
    });
  }
});

// @route   PUT api/admin/users/:id/toggle-status
// @desc    Toggle user active status
// @access  Private (Admin)
router.put('/users/:id/toggle-status', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error toggling user status'
    });
  }
});

// @route   PUT api/admin/users/:id/role
// @desc    Update user role
// @access  Private (Admin)
router.put('/users/:id/role', auth, adminOnly, async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['author', 'reviewer', 'editor', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.role = role;
    await user.save();

    res.json({
      success: true,
      message: 'User role updated successfully',
      user: {
        id: user._id,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating user role'
    });
  }
});

module.exports = router;