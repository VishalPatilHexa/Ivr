const path = require('path');
require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: process.env.MAX_FILE_SIZE || '10mb',
    requestTimeout: process.env.REQUEST_TIMEOUT || 30000,
  },

  // API Keys and External Services
  apis: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY,
      baseUrl: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1',
      defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID || '7w5JDCUNbeKrn4ySFgfu',
      model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
    },
  },

  // Database Configuration
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'hexahealth_ivr',
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    path: process.env.DB_PATH || path.join(__dirname, '../../data/database.sqlite'),
  },

  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || 'hexahealth-ivr-session-secret',
    maxAge: process.env.SESSION_MAX_AGE || 3600000, // 1 hour
    cleanupInterval: process.env.SESSION_CLEANUP_INTERVAL || 300000, // 5 minutes
  },

  // Audio Configuration
  audio: {
    maxDuration: process.env.MAX_AUDIO_DURATION || 60000, // 1 minute
    supportedFormats: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'webm', 'm4a'],
    defaultFormat: 'wav',
    sampleRate: process.env.AUDIO_SAMPLE_RATE || 16000,
  },

  // Conversation Configuration
  conversation: {
    maxRetries: process.env.CONVERSATION_MAX_RETRIES || 3,
    timeoutMs: process.env.CONVERSATION_TIMEOUT || 30000,
    supportedLanguages: ['en', 'hi', 'auto'],
    defaultLanguage: 'hi',
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(__dirname, '../../logs/app.log'),
    maxSize: process.env.LOG_MAX_SIZE || '10mb',
    maxFiles: process.env.LOG_MAX_FILES || 5,
    enableConsole: process.env.LOG_CONSOLE !== 'false',
  },

  // Security Configuration
  security: {
    rateLimit: {
      windowMs: process.env.RATE_LIMIT_WINDOW || 900000, // 15 minutes
      max: process.env.RATE_LIMIT_MAX || 100,
    },
    helmet: {
      contentSecurityPolicy: process.env.CSP_ENABLED !== 'false',
      hsts: process.env.HSTS_ENABLED !== 'false',
    },
  },

  // MCP Configuration
  mcp: {
    enablePatientDataTool: process.env.MCP_PATIENT_DATA_TOOL !== 'false',
    enableValidationTool: process.env.MCP_VALIDATION_TOOL !== 'false',
    enableAnalyticsTool: process.env.MCP_ANALYTICS_TOOL !== 'false',
    dataRetentionDays: process.env.MCP_DATA_RETENTION_DAYS || 30,
  },
};

// Validation function
function validateConfig() {
  const requiredEnvVars = [
    'GEMINI_API_KEY',
    'ELEVENLABS_API_KEY',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate API keys format
  if (config.apis.gemini.apiKey && !config.apis.gemini.apiKey.startsWith('AI')) {
    console.warn('Warning: Gemini API key format may be incorrect');
  }

  if (config.apis.elevenlabs.apiKey && config.apis.elevenlabs.apiKey.length < 20) {
    console.warn('Warning: ElevenLabs API key format may be incorrect');
  }

  return true;
}

// Initialize and validate configuration
try {
  validateConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
  process.exit(1);
}

module.exports = config;