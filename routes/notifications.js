const express = require('express');
const { sendReviewerAssignmentEmail, sendManuscriptStatusEmail, sendReviewReminderEmail } = require('../utils/emailService');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Test email notifications (for development/testing)
router.post('/test-reviewer-email', auth, async (req, res) => {
  try {
    const { reviewerEmail, reviewerName, manuscriptTitle, manuscriptId } = req.body;
    
    if (!reviewerEmail || !reviewerName || !manuscriptTitle || !manuscriptId) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: reviewerEmail, reviewerName, manuscriptTitle, manuscriptId'
      });
    }
    
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    
    const result = await sendReviewerAssignmentEmail(
      reviewerEmail,
      reviewerName,
      manuscriptTitle,
      manuscriptId,
      dueDate
    );
    
    res.json({
      success: result.success,
      message: result.success ? 'Test email sent successfully!' : 'Failed to send test email',
      error: result.error,
      messageId: result.messageId
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending test email',
      error: error.message
    });
  }
});

// Test manuscript status email
router.post('/test-status-email', auth, async (req, res) => {
  try {
    const { authorEmail, authorName, manuscriptTitle, oldStatus, newStatus } = req.body;
    
    if (!authorEmail || !authorName || !manuscriptTitle || !newStatus) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: authorEmail, authorName, manuscriptTitle, newStatus'
      });
    }
    
    const result = await sendManuscriptStatusEmail(
      authorEmail,
      authorName,
      manuscriptTitle,
      oldStatus || 'submitted',
      newStatus
    );
    
    res.json({
      success: result.success,
      message: result.success ? 'Test status email sent successfully!' : 'Failed to send test email',
      error: result.error,
      messageId: result.messageId
    });
    
  } catch (error) {
    console.error('Test status email error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending test status email',
      error: error.message
    });
  }
});

module.exports = router;