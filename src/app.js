const express = require("express");
const config = require("./config");
const corsConfig = require("./config/cors");
const errorHandler = require("./middlewares/error");
const requestLogger = require("./middlewares/logging");
const routes = require("./routes");
const Logger = require("./utils/logger");

const app = express();

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// CORS configuration
app.use(corsConfig);

// Request logging
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static("public"));
app.use("/uploads", express.static("storage/uploads"));

// API routes
app.use(routes);

// Health check endpoint at root
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'IVR Streaming Service is running',
    version: require('../package.json').version,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`
    }
  });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;