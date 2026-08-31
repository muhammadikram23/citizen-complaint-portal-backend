require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Route imports
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Database connection middleware for serverless invocations
app.use(async (req, res, next) => {
  // Let health check pass even if DB is still connecting
  if (req.path === '/api/health' || req.path === '/') {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Serverless DB Connect Error:', err.message);
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

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

// Only listen locally or in container/VM; skip during Vercel serverless functions
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, async () => {
    console.log(`=================================================`);
    console.log(`[SERVER RUNNING] Citizen Complaint Portal API`);
    console.log(`Port: http://localhost:${PORT}`);
    console.log(`Health Check: http://localhost:${PORT}/api/health`);
    console.log(`=================================================`);
    try {
      await connectDB();
    } catch (e) {}
  });
}

module.exports = app;
