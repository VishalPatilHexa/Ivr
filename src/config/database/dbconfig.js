/**
 * ===============================================================================
 * PRIMARY DATABASE CONFIGURATION
 * ===============================================================================
 *
 * Main database configuration for write operations
 * Environment-based configuration with fallbacks
 */

const options = {
  DB: {
    HOST: process.env.DB_HOST || "hexa-staging-db.cqnt4cbjitmj.ap-south-1.rds.amazonaws.com",
    USER: process.env.DB_USER || "admin",
    PASSWORD: process.env.DB_PASSWORD || "h3xah3a1tH14",
    DB: process.env.DB_NAME || "hexahealth_db",
    PORT: parseInt(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    
    // Connection pool configuration
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 10,      // Maximum connections
      min: parseInt(process.env.DB_POOL_MIN) || 2,       // Minimum connections
      acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 60000,  // 60 seconds
      idle: parseInt(process.env.DB_POOL_IDLE) || 30000,        // 30 seconds
      evict: parseInt(process.env.DB_POOL_EVICT) || 300000,     // 5 minutes
      handleDisconnects: true,
    },
    
    // Additional Sequelize options
    dialectOptions: {
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 60000,
      // SSL configuration for production
      ...(process.env.NODE_ENV === 'production' && {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      })
    },
    
    // Query configuration
    query: {
      raw: false,
      nest: false
    },
    
    // Retry configuration
    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ENOTFOUND/,
        /ER_CON_COUNT_ERROR/,
        /ECONNABORTED/,
        /ER_LOCK_WAIT_TIMEOUT/,
        /ER_LOCK_DEADLOCK/
      ],
      max: 3
    },
    
    // Timezone
    timezone: '+05:30', // IST
    
    // Logging
    logging: false,
    
    // Benchmark queries in development
    benchmark: false,
    
    // Define global options
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      freezeTableName: true,
      underscored: false,
      paranoid: false
    }
  },
};

module.exports = options;
