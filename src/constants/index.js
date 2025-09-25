/**
 * ===============================================================================
 * APPLICATION CONSTANTS
 * ===============================================================================
 *
 * Centralized constants for the IVR streaming application
 * Production-ready configuration with environment-based overrides
 */

// =============================================================================
// CONNECTION POOL CONSTANTS
// =============================================================================
const CONNECTION_POOL = {
  MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS) || 1000,
  CONNECTION_TIMEOUT: parseInt(process.env.CONNECTION_TIMEOUT) || 300000, // 5 minutes
  CLEANUP_INTERVAL: parseInt(process.env.CLEANUP_INTERVAL) || 60000, // 1 minute
  MAX_IDLE_TIME: parseInt(process.env.MAX_IDLE_TIME) || 600000, // 10 minutes

  // Pool utilization thresholds
  UTILIZATION_WARNING_THRESHOLD: 0.9,
  ERROR_RATE_THRESHOLD: 0.1,

  // Connection statuses
  CONNECTION_STATUS: {
    ACTIVE: "active",
    INACTIVE: "inactive",
    EXPIRED: "expired",
    FAILED: "failed",
  },

  // Cleanup reasons
  CLEANUP_REASONS: {
    TIMEOUT: "timeout",
    IDLE: "idle",
    WEBSOCKET_DEAD: "websocket_dead",
    WEBSOCKET_CLOSED: "websocket_closed",
    WEBSOCKET_ERROR: "websocket_error",
    MANUAL: "manual",
    SHUTDOWN: "shutdown",
  },
};

// =============================================================================
// SESSION MANAGER CONSTANTS
// =============================================================================
const SESSION_MANAGER = {
  // TTL values (in seconds)
  SESSION_TTL: parseInt(process.env.SESSION_TTL) || 3600, // 1 hour
  CONVERSATION_TTL: parseInt(process.env.CONVERSATION_TTL) || 7200, // 2 hours
  LOCK_TTL: parseInt(process.env.LOCK_TTL) || 30, // 30 seconds
  HEALTH_TTL: 60, // 1 minute
  STATS_TTL: 300, // 5 minutes

  // Redis configuration
  REDIS_CONFIG: {
    HOST: process.env.REDIS_HOST || "localhost",
    PORT: parseInt(process.env.REDIS_PORT) || 6379,
    PASSWORD: process.env.REDIS_PASSWORD,
    RETRY_ATTEMPTS: parseInt(process.env.REDIS_RETRY_ATTEMPTS) || 3,
    RETRY_DELAY: parseInt(process.env.REDIS_RETRY_DELAY) || 1000,
    RETRY_TIME_LIMIT: 1000 * 60 * 60, // 1 hour
    MAX_RETRY_DELAY: 3000,
  },

  // Redis key prefixes
  REDIS_PREFIXES: {
    session: "ivr:session:",
    conversation: "ivr:conversation:",
    lock: "ivr:lock:",
    stats: "ivr:stats:",
    health: "ivr:health:",
  },

  // Session statuses
  SESSION_STATUS: {
    CREATED: "created",
    ACTIVE: "active",
    INACTIVE: "inactive",
    EXPIRED: "expired",
    TERMINATED: "terminated",
  },

  // Conversation statuses
  CONVERSATION_STATUS: {
    ACTIVE: "active",
    PAUSED: "paused",
    COMPLETED: "completed",
    TERMINATED: "terminated",
  },

  // Event types
  EVENT_TYPES: {
    SESSION_CREATED: "session:created",
    SESSION_UPDATED: "session:updated",
    SESSION_DELETED: "session:deleted",
    CONVERSATION_CREATED: "conversation:created",
    CONVERSATION_UPDATED: "conversation:updated",
    CONVERSATION_DELETED: "conversation:deleted",
  },

  // Limits
  MAX_CONVERSATION_MESSAGES: 100,
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  STATS_UPDATE_INTERVAL: 30000, // 30 seconds
};

// =============================================================================
// REDIS CONNECTION POOL CONSTANTS
// =============================================================================
const REDIS_POOL = {
  // Pool configuration
  MIN_CONNECTIONS: 2,
  MAX_CONNECTIONS: 20,
  ACQUIRE_TIMEOUT: 30000, // 30 seconds
  IDLE_TIMEOUT: 300000, // 5 minutes
  EVICTION_RUN_INTERVAL: 60000, // 1 minute
  
  // Connection configuration
  CONNECTION_CONFIG: {
    host: "127.0.0.1",
    port: 6379,
    db: 1,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
  },
  
  // Pool databases for different purposes
  DATABASES: {
    SESSIONS: 1,
    CONNECTIONS: 2,
    CACHE: 3,
    LOCKS: 4,
  },
  
  // Health check configuration
  HEALTH_CHECK: {
    INTERVAL: 30000, // 30 seconds
    TIMEOUT: 5000, // 5 seconds
    RETRY_COUNT: 3,
  },
};

// =============================================================================
// WEBSOCKET CONSTANTS
// =============================================================================
const WEBSOCKET = {
  // WebSocket ready states
  WEBSOCKET_STATES: {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  },

  // Close codes
  CLOSE_CODES: {
    NORMAL: 1000,
    GOING_AWAY: 1001,
    PROTOCOL_ERROR: 1002,
    UNSUPPORTED_DATA: 1003,
    NO_STATUS: 1005,
    ABNORMAL: 1006,
    INVALID_FRAME_PAYLOAD: 1007,
    POLICY_VIOLATION: 1008,
    MESSAGE_TOO_BIG: 1009,
    MANDATORY_EXTENSION: 1010,
    INTERNAL_ERROR: 1011,
    SERVICE_RESTART: 1012,
    TRY_AGAIN_LATER: 1013,
    BAD_GATEWAY: 1014,
    TLS_HANDSHAKE: 1015,
  },

  // Message types
  MESSAGE_TYPES: {
    TEXT: "text",
    BINARY: "binary",
    PING: "ping",
    PONG: "pong",
    CLOSE: "close",
  },

  // Client types
  CLIENT_TYPES: {
    BROWSER: "browser",
    MOBILE: "mobile",
    API: "api",
    ADMIN: "admin",
    AGENT: "agent",
    UNKNOWN: "unknown",
  },

  // Heartbeat settings
  HEARTBEAT: {
    INTERVAL: 30000, // 30 seconds
    TIMEOUT: 60000, // 60 seconds
  },
};

// =============================================================================
// STREAMING CONSTANTS
// =============================================================================
const STREAMING = {
  // Audio settings
  AUDIO: {
    SAMPLE_RATE: 16000,
    BIT_DEPTH: 16,
    CHANNELS: 1,
    FORMAT: "pcm",
    ENCODING: "linear16",
  },

  // Buffer settings
  BUFFER: {
    SIZE: 4096,
    MAX_SIZE: 65536,
    CHUNK_SIZE: 1024,
  },

  // Protocol settings
  PROTOCOLS: {
    WEBSOCKET: "websocket",
    HTTP: "http",
    HTTPS: "https",
  },

  // Stream states
  STREAM_STATES: {
    IDLE: "idle",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    STREAMING: "streaming",
    PAUSED: "paused",
    STOPPED: "stopped",
    ERROR: "error",
  },
};

// =============================================================================
// ERROR CONSTANTS
// =============================================================================
const ERRORS = {
  // Error codes
  CODES: {
    POOL_LIMIT_EXCEEDED: "POOL_LIMIT_EXCEEDED",
    CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
    SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
    CONVERSATION_NOT_FOUND: "CONVERSATION_NOT_FOUND",
    REDIS_CONNECTION_FAILED: "REDIS_CONNECTION_FAILED",
    WEBSOCKET_ERROR: "WEBSOCKET_ERROR",
    INVALID_CLIENT_TYPE: "INVALID_CLIENT_TYPE",
    LOCK_ACQUISITION_FAILED: "LOCK_ACQUISITION_FAILED",
    AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
    AUTHORIZATION_FAILED: "AUTHORIZATION_FAILED",
    RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    STREAMING_ERROR: "STREAMING_ERROR",
  },

  // HTTP status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
  },
};

// =============================================================================
// LOGGING CONSTANTS
// =============================================================================
const LOGGING = {
  LEVELS: {
    ERROR: "error",
    WARN: "warn",
    INFO: "info",
    DEBUG: "debug",
    TRACE: "trace",
  },

  // Log categories
  CATEGORIES: {
    CONNECTION: "connection",
    SESSION: "session",
    CONVERSATION: "conversation",
    STREAMING: "streaming",
    WEBSOCKET: "websocket",
    REDIS: "redis",
    HEALTH: "health",
    PERFORMANCE: "performance",
    SECURITY: "security",
  },
};

// =============================================================================
// MONITORING CONSTANTS
// =============================================================================
const MONITORING = {
  // Metric types
  METRICS: {
    COUNTER: "counter",
    GAUGE: "gauge",
    HISTOGRAM: "histogram",
    SUMMARY: "summary",
  },

  // Health check statuses
  HEALTH_STATUS: {
    HEALTHY: "healthy",
    WARNING: "warning",
    UNHEALTHY: "unhealthy",
    CRITICAL: "critical",
  },

  // Performance thresholds
  THRESHOLDS: {
    RESPONSE_TIME_WARNING: 1000, // 1 second
    RESPONSE_TIME_CRITICAL: 5000, // 5 seconds
    MEMORY_WARNING: 0.8, // 80% of available memory
    MEMORY_CRITICAL: 0.95, // 95% of available memory
    CPU_WARNING: 0.8, // 80% CPU usage
    CPU_CRITICAL: 0.95, // 95% CPU usage
  },
};

// =============================================================================
// APPLICATION CONSTANTS
// =============================================================================
const APPLICATION = {
  // Environment
  ENV: process.env.NODE_ENV || "development",

  // Server settings
  SERVER: {
    PORT: parseInt(process.env.PORT) || 3000,
    HOST: process.env.HOST || "0.0.0.0",
    TIMEOUT: parseInt(process.env.SERVER_TIMEOUT) || 30000,
  },

  // Node identification
  NODE_ID: process.env.NODE_ID || require("os").hostname(),

  // API versioning
  API_VERSION: process.env.API_VERSION || "v1",

  // Security
  SECURITY: {
    CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
    MAX_REQUEST_SIZE: process.env.MAX_REQUEST_SIZE || "10mb",
    RATE_LIMIT_WINDOW:
      parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100, // requests per window
  },

  // External API Keys
  API_KEYS: {
    ELEVENLABS: process.env.ELEVENLABS_API_KEY,
  },

  // API Configuration
  API_CONFIG: {
    TIMEOUT: parseInt(process.env.API_TIMEOUT) || 30000, // 30 seconds
    RETRY_ATTEMPTS: parseInt(process.env.API_RETRY_ATTEMPTS) || 3,
    RETRY_DELAY: parseInt(process.env.API_RETRY_DELAY) || 1000, // 1 second
    MAX_RETRY_DELAY: parseInt(process.env.API_MAX_RETRY_DELAY) || 5000, // 5 seconds
  },
};

// =============================================================================
// API ENDPOINTS CONSTANTS
// =============================================================================
const API_ENDPOINTS = {
  // ElevenLabs API endpoints
  ELEVENLABS: {
    BASE_URL: "https://api.elevenlabs.io/v1",
    WEBSOCKET_URL: "wss://api.elevenlabs.io/v1/convai/conversation",
    VOICES: "/voices",
    AGENTS: "/convai/agents",
    CONVERSATIONS: "/convai/conversations",
    SPEECH: "/text-to-speech",
    HISTORY: "/history",
  },

  // Knowlarity API endpoints
  KNOWLARITY: {
    BASE_URL: "https://kpi.knowlarity.com/Basic",
    WEBHOOK_URL: "https://kpi.knowlarity.com/webhooks",
    CALL_LOGS: "/call_logs",
    OUTBOUND_CALL: "/make_call",
    PHONE_NUMBERS: "/phone_numbers",
  },

  // Internal API endpoints
  INTERNAL: {
    HEALTH: "/health",
    STREAM: "/stream",
    WEBHOOK: "/webhook",
    ANALYTICS: "/analytics",
  },

  // External service endpoints
  EXTERNAL: {
    TWILIO: {
      BASE_URL: "https://api.twilio.com/2010-04-01",
      CALLS: "/Calls",
      MESSAGES: "/Messages",
    },
  },
};

// =============================================================================
// DATABASE CONSTANTS
// =============================================================================
const DATABASE = {
  // Database table names
  TABLES: {
    SESSIONS: "sessions",
    CONVERSATIONS: "conversations",
    CALL_LOGS: "call_logs",
    AGENTS: "agents",
    PATIENTS: "patients",
    ALLERGIES: "allergies",
    MEDICAL_HISTORY: "medical_history",
    APPOINTMENTS: "appointments",
  },

  // Database operations
  OPERATIONS: {
    CREATE: "CREATE",
    READ: "READ",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
  },

  // Connection states
  CONNECTION_STATES: {
    CONNECTED: "connected",
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    ERROR: "error",
  },
};

module.exports = {
  CONNECTION_POOL,
  SESSION_MANAGER,
  REDIS_POOL,
  WEBSOCKET,
  STREAMING,
  ERRORS,
  LOGGING,
  MONITORING,
  APPLICATION,
  DATABASE,
  API_ENDPOINTS,
};
