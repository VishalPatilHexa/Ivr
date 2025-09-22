require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Configuration
  api: {
    version: 'v1',
    prefix: '/api'
  },

  // Streaming Configuration
  streaming: {
    maxConnections: process.env.MAX_CONNECTIONS || 100,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 300000, // 5 minutes
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  },

  // File Upload Configuration
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || 10485760, // 10MB
    allowedTypes: ['audio/wav', 'audio/mp3', 'audio/mpeg']
  }
};