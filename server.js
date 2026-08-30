const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Route imports
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const aiRoutes = require('./routes/aiRoutes');

const User = require('./models/User');

// Initialize database connection & auto-seed officer if missing
const initDBAndSeed = async () => {
  await connectDB();
  try {
    const email = (process.env.OFFICER_EMAIL || 'officer@citygov.org').toLowerCase().trim();
    const existing = await User.findOne({ email });
    if (!existing) {
      await User.create({
        name: process.env.OFFICER_NAME || 'City Officer',
        email,
        password: process.env.OFFICER_PASSWORD || 'Officer@123',
        role: 'officer',
      });
      console.log(`[AUTO-SEEDED] Created default officer account: ${email}`);
    } else if (existing.role !== 'officer') {
      existing.role = 'officer';
      await existing.save();
    }
  } catch (err) {
    console.warn('[Auto-seed Officer Warning]:', err.message);
  }
};

initDBAndSeed();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Citizen Complaint Portal API is operational',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/ai', aiRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Citizen Complaint Portal Backend API is active. Access endpoints at /api/...');
});

// 404 Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`[SERVER RUNNING] Citizen Complaint Portal API`);
  console.log(`Port: http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=================================================`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process if fatal
});

module.exports = app;
