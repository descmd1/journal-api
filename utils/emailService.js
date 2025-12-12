const nodemailer = require('nodemailer');

// Create transporter for sending emails
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send email to reviewer about new assignment
const sendReviewerAssignmentEmail = async (reviewerEmail, reviewerName, manuscriptTitle, manuscriptId, dueDate) => {
  try {
    const transporter = createTransporter();
    
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
    const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?tab=reviews`;
    
    const mailOptions = {
      from: `"Nigerian Journal Platform" <${process.env.EMAIL_USER}>`,
      to: reviewerEmail,
      subject: 'New Manuscript Review Assignment - Nigerian Journal Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">📚 New Review Assignment</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; margin-bottom: 20px;">Dear ${reviewerName},</p>
            
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              You have been assigned to review a new manuscript on the Nigerian Journal Platform. 
              We appreciate your expertise and contribution to the academic community.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">📄 Manuscript Details:</h3>
              <p><strong>Title:</strong> ${manuscriptTitle}</p>
              <p><strong>Manuscript ID:</strong> ${manuscriptId}</p>
              <p><strong>Review Due Date:</strong> ${new Date(dueDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
            </div>
            
            <div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #0066cc;">🎯 What's Next?</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li>Log in to your reviewer dashboard</li>
                <li>Access the manuscript and supplementary files</li>
                <li>Conduct a thorough peer review</li>
                <li>Submit your review before the due date</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${reviewUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                🔗 Access Reviewer Dashboard
              </a>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>⏰ Reminder:</strong> Please complete your review by ${new Date(dueDate).toLocaleDateString()}. 
                If you cannot meet this deadline or have any conflicts, please contact us immediately.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
            
            <p style="font-size: 14px; color: #6c757d; margin-bottom: 10px;">
              If you're not yet registered or have trouble accessing the platform:
            </p>
            <p style="text-align: center; margin: 20px 0;">
              <a href="${loginUrl}" style="color: #667eea; text-decoration: none; font-weight: bold;">
                Click here to log in →
              </a>
            </p>
            
            <p style="font-size: 14px; color: #6c757d; line-height: 1.5;">
              Thank you for contributing to the advancement of Nigerian academic research. 
              Your expert review helps maintain the quality and integrity of scholarly publications.
            </p>
            
            <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
              Best regards,<br>
              <strong>Nigerian Journal Platform Editorial Team</strong>
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Reviewer assignment email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending reviewer assignment email:', error);
    return { success: false, error: error.message };
  }
};

// Send email when manuscript status changes
const sendManuscriptStatusEmail = async (authorEmail, authorName, manuscriptTitle, oldStatus, newStatus, editorRemarks = null, revisionInstructions = null, revisionDeadline = null) => {
  try {
    const transporter = createTransporter();
    
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
    
    const statusMessages = {
      'submitted': 'Your manuscript has been successfully submitted and is awaiting initial review.',
      'under-review': 'Your manuscript is now under peer review. You will be notified once reviews are completed.',
      'revision-required': 'The reviewers have requested revisions to your manuscript. Please check your dashboard for detailed feedback.',
      'submitted-back': 'Your manuscript has been reviewed and returned for revisions. Please check the editorial remarks below and revise your manuscript accordingly.',
      'accepted': 'Congratulations! Your manuscript has been accepted for publication.',
      'rejected': 'We regret to inform you that your manuscript was not accepted for publication. Please check the reviewer comments for feedback.',
      'published': 'Your manuscript has been successfully published! Thank you for your contribution.'
    };
    
    const message = statusMessages[newStatus] || `Your manuscript status has been updated to: ${newStatus}`;
    
    const mailOptions = {
      from: `"Nigerian Journal Platform" <${process.env.EMAIL_USER}>`,
      to: authorEmail,
      subject: `Manuscript Status Update: ${manuscriptTitle} - Nigerian Journal Platform`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">📝 Manuscript Status Update</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; margin-bottom: 20px;">Dear ${authorName},</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">📄 Manuscript: ${manuscriptTitle}</h3>
              <p><strong>Status Change:</strong> ${oldStatus} → <span style="color: #28a745; font-weight: bold;">${newStatus}</span></p>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              ${message}
            </p>
            
            ${editorRemarks ? `
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; border-left: 4px solid #2196f3; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #1976d2;">📝 Editorial Remarks:</h4>
              <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0; white-space: pre-wrap;">${editorRemarks}</p>
            </div>
            ` : ''}
            
            ${revisionInstructions ? `
            <div style="background: #fff3e0; padding: 20px; border-radius: 8px; border-left: 4px solid #ff9800; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #f57c00;">🔧 Revision Instructions:</h4>
              <p style="font-size: 15px; line-height: 1.6; margin-bottom: 0; white-space: pre-wrap;">${revisionInstructions}</p>
              ${revisionDeadline ? `<p style="margin-top: 15px; margin-bottom: 0;"><strong>Deadline:</strong> ${new Date(revisionDeadline).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>` : ''}
            </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                📊 View Dashboard
              </a>
            </div>
            
            <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
              Best regards,<br>
              <strong>Nigerian Journal Platform Editorial Team</strong>
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Manuscript status email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending manuscript status email:', error);
    return { success: false, error: error.message };
  }
};

// Send reminder email to reviewer
const sendReviewReminderEmail = async (reviewerEmail, reviewerName, manuscriptTitle, daysLeft) => {
  try {
    const transporter = createTransporter();
    
    const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?tab=reviews`;
    
    const mailOptions = {
      from: `"Nigerian Journal Platform" <${process.env.EMAIL_USER}>`,
      to: reviewerEmail,
      subject: `Review Reminder: ${manuscriptTitle} - ${daysLeft} days remaining`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">⏰ Review Reminder</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; margin-bottom: 20px;">Dear ${reviewerName},</p>
            
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              This is a friendly reminder that you have a pending manuscript review that is due in <strong>${daysLeft} days</strong>.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #f39c12; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">📄 Manuscript: ${manuscriptTitle}</h3>
              <p style="color: #e67e22; font-weight: bold;">⏰ ${daysLeft} days remaining</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${reviewUrl}" style="background: #f39c12; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                📝 Complete Review
              </a>
            </div>
            
            <p style="font-size: 14px; color: #6c757d; margin-top: 30px;">
              Thank you for your dedication to academic excellence.<br>
              <strong>Nigerian Journal Platform Editorial Team</strong>
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Review reminder email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending review reminder email:', error);
    return { success: false, error: error.message };
  }
};

// Send email to editor about manuscript assignment
const sendEditorAssignmentEmail = async (editorEmail, editorName, manuscriptTitle, manuscriptId) => {
  try {
    const transporter = createTransporter();
    
    const editorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/editor`;
    
    const mailOptions = {
      from: `"Nigerian Journal Platform" <${process.env.EMAIL_USER}>`,
      to: editorEmail,
      subject: 'New Manuscript Assignment - Nigerian Journal Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">📚 New Manuscript Assignment</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <p style="font-size: 16px; margin-bottom: 20px;">Dear Editor ${editorName},</p>
            
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              A new manuscript has been assigned to you for editorial review and management on the Nigerian Journal Platform.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">📄 Manuscript Details:</h3>
              <p><strong>Title:</strong> ${manuscriptTitle}</p>
              <p><strong>Manuscript ID:</strong> ${manuscriptId}</p>
            </div>
            
            <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0066cc;">🎯 Next Steps:</h3>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Review the manuscript for initial editorial assessment</li>
                <li>Decide whether to send for peer review or desk reject</li>
                <li>If suitable for peer review, assign appropriate reviewers</li>
                <li>Manage the review process and make final editorial decisions</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${editorUrl}" 
                 style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                📊 Access Editor Dashboard
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Please log in to your editor dashboard to begin the editorial process. If you have any questions, 
              please contact the journal administration.
            </p>
            
            <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; text-align: center; color: #666; font-size: 12px;">
              <p>This is an automated message from the Nigerian Journal Platform.</p>
              <p>© 2025 Nigerian Journal Platform. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Editor assignment email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending editor assignment email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendReviewerAssignmentEmail,
  sendManuscriptStatusEmail,
  sendReviewReminderEmail,
  sendEditorAssignmentEmail
};