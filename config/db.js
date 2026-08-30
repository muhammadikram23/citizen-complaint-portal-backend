const mongoose = require('mongoose');

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  try {
    const dns = require('dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (e) {
    // Ignore DNS override errors
  }
}

let cachedConnection = null;

const connectDB = async (customUri) => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  if (cachedConnection) {
    return cachedConnection;
  }
  try {
    const uri = customUri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/citizen_complaint_portal';
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    cachedConnection = conn;
    console.log(`[MongoDB Connected]: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB Connection Error]: ${error.message}`);
    if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
