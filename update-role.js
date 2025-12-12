require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function updateUserRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nigerian-journal');
    console.log('Connected to MongoDB');

    // Find and update James Carter
    const user = await User.findOneAndUpdate(
      { firstName: 'James', lastName: 'Carter' },
      { role: 'editor' },
      { new: true }
    );

    if (user) {
      console.log('✅ Updated James Carter to editor role!');
      console.log(`User: ${user.firstName} ${user.lastName} (${user.email})`);
      console.log(`New role: ${user.role}`);
    } else {
      console.log('❌ James Carter not found');
      
      // Show all users
      const allUsers = await User.find().select('firstName lastName email role');
      console.log('\n📋 All users in database:');
      allUsers.forEach(u => {
        console.log(`- ${u.firstName} ${u.lastName} (${u.email}) - ${u.role}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

updateUserRole();