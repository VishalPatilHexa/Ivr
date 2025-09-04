const config = require('../config');

/**
 * Log session status update
 */
function logSessionStatus(sessionId, status, additionalInfo = {}) {
  const logData = {
    sessionId,
    status,
    source: "Knowlarity",
    timestamp: new Date().toISOString(),
    ...additionalInfo
  };

  console.log('📊 Session Status:', logData);
}

/**
 * Log with different levels based on config
 */
function log(level, message, data = null) {
  if (config.logging.enableDebug || level !== 'debug') {
    const timestamp = new Date().toISOString();
    const logMessage = data 
      ? `[${timestamp}] ${level.toUpperCase()}: ${message} ${JSON.stringify(data, null, 2)}`
      : `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    console.log(logMessage);
  }
}

/**
 * Log error with stack trace
 */
function logError(message, error) {
  console.error(`❌ ${message}:`, error.message);
  if (config.logging.enableDebug) {
    console.error(error.stack);
  }
}

module.exports = {
  logSessionStatus,
  log,
  logError,
};