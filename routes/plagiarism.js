const express = require('express');
const { body, validationResult } = require('express-validator');
const Manuscript = require('../models/Manuscript');
const { auth, authorize } = require('../middleware/auth');
const plagiarismService = require('../utils/plagiarismService');

const router = express.Router();

// @route   POST api/plagiarism/check/:manuscriptId
// @desc    Run plagiarism check on manuscript
// @access  Private (Editor/Admin)
router.post('/check/:manuscriptId', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;

    // Find the manuscript
    const manuscript = await Manuscript.findById(manuscriptId);
    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    // Check if plagiarism check is already in progress
    if (manuscript.plagiarismCheck?.status === 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Plagiarism check is already in progress for this manuscript'
      });
    }

    // Update status to processing (only update specific fields to avoid validation issues)
    manuscript.plagiarismCheck = manuscript.plagiarismCheck || {};
    manuscript.plagiarismCheck.status = 'processing';
    manuscript.plagiarismCheck.checkedBy = req.user.id;
    manuscript.plagiarismCheck.lastChecked = new Date();
    
    // Mark the plagiarismCheck field as modified
    manuscript.markModified('plagiarismCheck');
    await manuscript.save();

    // Run plagiarism check (async)
    const checkResult = await plagiarismService.checkPlagiarism(
      manuscriptId,
      manuscript.title,
      manuscript.abstract,
      manuscript.content || manuscript.abstract, // Use abstract if no full content
      manuscript.keywords
    );

    if (checkResult.success) {
      // Update manuscript with results
      manuscript.plagiarismCheck = manuscript.plagiarismCheck || {};
      manuscript.plagiarismCheck.status = 'completed';
      manuscript.plagiarismCheck.overallSimilarity = checkResult.report.overallSimilarity;
      manuscript.plagiarismCheck.similarityStatus = checkResult.report.status;
      manuscript.plagiarismCheck.scanDate = checkResult.report.scanDate;
      manuscript.plagiarismCheck.checkedBy = req.user.id;
      manuscript.plagiarismCheck.lastChecked = new Date();
      
      // Properly structure the report object
      manuscript.plagiarismCheck.report = {
        sources: checkResult.report.sources || [],
        details: {
          titleSimilarity: checkResult.report.details?.titleSimilarity || 0,
          abstractSimilarity: checkResult.report.details?.abstractSimilarity || 0,
          contentSimilarity: checkResult.report.details?.contentSimilarity || 0,
          wordCount: checkResult.report.details?.wordCount || 0,
          excludedSources: checkResult.report.details?.excludedSources || []
        },
        recommendations: checkResult.report.recommendations || [],
        scanEngine: checkResult.report.scanEngine || 'NigJournal Plagiarism Detector',
        processingTime: checkResult.report.processingTime || 0
      };
      
      manuscript.markModified('plagiarismCheck');
      await manuscript.save();

      res.json({
        success: true,
        message: 'Plagiarism check completed successfully',
        report: checkResult.report
      });
    } else {
      // Update status to failed
      manuscript.plagiarismCheck = manuscript.plagiarismCheck || {};
      manuscript.plagiarismCheck.status = 'failed';
      manuscript.plagiarismCheck.lastChecked = new Date();
      
      manuscript.markModified('plagiarismCheck');
      await manuscript.save();

      res.status(500).json({
        success: false,
        message: 'Plagiarism check failed',
        error: checkResult.error
      });
    }

  } catch (error) {
    console.error('Plagiarism check error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during plagiarism check'
    });
  }
});

// @route   GET api/plagiarism/report/:manuscriptId
// @desc    Get plagiarism report for manuscript
// @access  Private (Editor/Admin/Reviewer)
router.get('/report/:manuscriptId', auth, authorize('editor', 'admin', 'reviewer'), async (req, res) => {
  try {
    const { manuscriptId } = req.params;

    const manuscript = await Manuscript.findById(manuscriptId)
      .populate('plagiarismCheck.checkedBy', 'firstName lastName')
      .select('title plagiarismCheck');

    if (!manuscript) {
      return res.status(404).json({
        success: false,
        message: 'Manuscript not found'
      });
    }

    if (!manuscript.plagiarismCheck || manuscript.plagiarismCheck.status === 'pending') {
      return res.status(404).json({
        success: false,
        message: 'No plagiarism check has been performed on this manuscript'
      });
    }

    res.json({
      success: true,
      manuscriptTitle: manuscript.title,
      plagiarismCheck: manuscript.plagiarismCheck
    });

  } catch (error) {
    console.error('Get plagiarism report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving plagiarism report'
    });
  }
});

// @route   GET api/plagiarism/dashboard
// @desc    Get plagiarism dashboard with statistics
// @access  Private (Editor/Admin)
router.get('/dashboard', auth, authorize('editor', 'admin'), async (req, res) => {
  try {
    // Get plagiarism statistics
    const totalChecks = await Manuscript.countDocuments({
      'plagiarismCheck.status': { $exists: true, $ne: 'pending' }
    });

    const acceptableCount = await Manuscript.countDocuments({
      'plagiarismCheck.similarityStatus': 'acceptable'
    });

    const moderateCount = await Manuscript.countDocuments({
      'plagiarismCheck.similarityStatus': 'moderate'
    });

    const highCount = await Manuscript.countDocuments({
      'plagiarismCheck.similarityStatus': 'high'
    });

    const processingCount = await Manuscript.countDocuments({
      'plagiarismCheck.status': 'processing'
    });

    const failedCount = await Manuscript.countDocuments({
      'plagiarismCheck.status': 'failed'
    });

    // Get recent checks
    const recentChecks = await Manuscript.find({
      'plagiarismCheck.status': 'completed'
    })
    .populate('submittedBy', 'firstName lastName')
    .populate('plagiarismCheck.checkedBy', 'firstName lastName')
    .select('title plagiarismCheck submittedBy')
    .sort({ 'plagiarismCheck.scanDate': -1 })
    .limit(10);

    // Calculate average similarity
    const manuscriptsWithSimilarity = await Manuscript.find({
      'plagiarismCheck.overallSimilarity': { $exists: true }
    }).select('plagiarismCheck.overallSimilarity');

    const averageSimilarity = manuscriptsWithSimilarity.length > 0 
      ? manuscriptsWithSimilarity.reduce((sum, m) => sum + m.plagiarismCheck.overallSimilarity, 0) / manuscriptsWithSimilarity.length
      : 0;

    res.json({
      success: true,
      statistics: {
        totalChecks,
        acceptableCount,
        moderateCount,
        highCount,
        processingCount,
        failedCount,
        averageSimilarity: Math.round(averageSimilarity * 100) / 100
      },
      recentChecks
    });

  } catch (error) {
    console.error('Plagiarism dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving plagiarism dashboard'
    });
  }
});

// @route   POST api/plagiarism/bulk-check
// @desc    Run plagiarism check on multiple manuscripts
// @access  Private (Admin)
router.post('/bulk-check', auth, authorize('admin'), [
  body('manuscriptIds', 'Manuscript IDs array is required').isArray({ min: 1 })
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

    const { manuscriptIds } = req.body;
    const results = [];

    for (const manuscriptId of manuscriptIds) {
      try {
        const manuscript = await Manuscript.findById(manuscriptId);
        if (!manuscript) {
          results.push({
            manuscriptId,
            success: false,
            error: 'Manuscript not found'
          });
          continue;
        }

        // Skip if already processing
        if (manuscript.plagiarismCheck?.status === 'processing') {
          results.push({
            manuscriptId,
            success: false,
            error: 'Already processing'
          });
          continue;
        }

        // Start plagiarism check
        const checkResult = await plagiarismService.checkPlagiarism(
          manuscriptId,
          manuscript.title,
          manuscript.abstract,
          manuscript.content || manuscript.abstract,
          manuscript.keywords
        );

        if (checkResult.success) {
          manuscript.plagiarismCheck = manuscript.plagiarismCheck || {};
          manuscript.plagiarismCheck.status = 'completed';
          manuscript.plagiarismCheck.overallSimilarity = checkResult.report.overallSimilarity;
          manuscript.plagiarismCheck.similarityStatus = checkResult.report.status;
          manuscript.plagiarismCheck.scanDate = checkResult.report.scanDate;
          manuscript.plagiarismCheck.checkedBy = req.user.id;
          manuscript.plagiarismCheck.lastChecked = new Date();
          manuscript.plagiarismCheck.report = checkResult.report;
          
          manuscript.markModified('plagiarismCheck');
          await manuscript.save();

          results.push({
            manuscriptId,
            success: true,
            similarity: checkResult.report.overallSimilarity,
            status: checkResult.report.status
          });
        } else {
          results.push({
            manuscriptId,
            success: false,
            error: checkResult.error
          });
        }

      } catch (error) {
        results.push({
          manuscriptId,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk plagiarism check completed for ${manuscriptIds.length} manuscripts`,
      results
    });

  } catch (error) {
    console.error('Bulk plagiarism check error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk plagiarism check'
    });
  }
});

module.exports = router;