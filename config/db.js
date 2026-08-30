const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const connectDB = async (customUri) => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  try {
    const uri = customUri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/citizen_complaint_portal';
    const conn = await mongoose.connect(uri);
    console.log(`[MongoDB Connected]: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB Connection Error]: ${error.message}`);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
