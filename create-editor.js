require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function createEditor() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nigerian-journal');
    console.log('Connected to MongoDB');

    // Check if editor already exists
    const existingEditor = await User.findOne({ email: 'editor@example.com' });
    if (existingEditor) {
      console.log('Editor already exists:', existingEditor.email);
      console.log('Role:', existingEditor.role);
      process.exit(0);
    }

    // Create new editor
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const editor = new User({
      firstName: 'Test',
      lastName: 'Editor',
      email: 'editor@example.com',
      password: hashedPassword,
      role: 'editor',
      institution: 'Test University',
      isActive: true
    });

    await editor.save();
    console.log('✅ Editor created successfully!');
    console.log('Email: editor@example.com');
    console.log('Password: password123');
    console.log('Role: editor');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

createEditor();