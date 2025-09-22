const config = require('../config');

class Logger {
  static info(message, meta = {}) {
    console.log(`ℹ️  [INFO] ${new Date().toISOString()} - ${message}`, meta);
  }

  static error(message, error = null, meta = {}) {
    console.error(`❌ [ERROR] ${new Date().toISOString()} - ${message}`, error, meta);
  }

  static warn(message, meta = {}) {
    console.warn(`⚠️  [WARN] ${new Date().toISOString()} - ${message}`, meta);
  }

  static debug(message, meta = {}) {
    if (config.nodeEnv === 'development') {
      console.log(`🐛 [DEBUG] ${new Date().toISOString()} - ${message}`, meta);
    }
  }

  static success(message, meta = {}) {
    console.log(`✅ [SUCCESS] ${new Date().toISOString()} - ${message}`, meta);
  }
}

module.exports = Logger;