const express = require('express');
const Journal = require('../models/Journal');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// @route   GET api/journals
// @desc    Get all journals
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    
    const query = { isActive: true };
    
    if (category) {
      query.categories = { $in: [category] };
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    const journals = await Journal.find(query)
      .populate('editor', 'firstName lastName institution')
      .populate('editorialBoard.user', 'firstName lastName institution')
      .select('-editorialBoard -associateEditors')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ establishedDate: -1 });

    const total = await Journal.countDocuments(query);

    res.json({
      success: true,
      journals,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalJournals: total
    });

  } catch (error) {
    console.error('Get journals error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching journals'
    });
  }
});

// @route   GET api/journals/:id
// @desc    Get single journal
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const journal = await Journal.findById(req.params.id)
      .populate('editor', 'firstName lastName institution expertise')
      .populate('associateEditors', 'firstName lastName institution')
      .populate('editorialBoard.user', 'firstName lastName institution expertise');

    if (!journal) {
      return res.status(404).json({
        success: false,
        message: 'Journal not found'
      });
    }

    res.json({
      success: true,
      journal
    });

  } catch (error) {
    console.error('Get journal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching journal'
    });
  }
});

module.exports = router;