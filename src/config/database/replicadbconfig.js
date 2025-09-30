/**
 * ===============================================================================
 * REPLICA DATABASE CONFIGURATION
 * ===============================================================================
 *
 * Read replica database configuration for read operations
 * Environment-based configuration with fallbacks
 */

const options = {
  DB: {
    HOST: process.env.DB_REPLICA_HOST || "hexa-staging-db.cqnt4cbjitmj.ap-south-1.rds.amazonaws.com",
    USER: process.env.DB_REPLICA_USER || "admin", 
    PASSWORD: process.env.DB_REPLICA_PASSWORD || "h3xah3a1tH14",
    DB: process.env.DB_REPLICA_NAME || "hexahealth_db",
    PORT: parseInt(process.env.DB_REPLICA_PORT) || 3306,
    dialect: "mysql",
    
    // Connection pool configuration for replica (read-heavy workload)
    pool: {
      max: parseInt(process.env.DB_REPLICA_POOL_MAX) || 15,    // Higher max for read queries
      min: parseInt(process.env.DB_REPLICA_POOL_MIN) || 2,     // Minimum connections
      acquire: parseInt(process.env.DB_REPLICA_POOL_ACQUIRE) || 60000,  // 60 seconds
      idle: parseInt(process.env.DB_REPLICA_POOL_IDLE) || 30000,        // 30 seconds
      evict: parseInt(process.env.DB_REPLICA_POOL_EVICT) || 300000,     // 5 minutes
      handleDisconnects: true,
    },
    
    // Additional Sequelize options
    dialectOptions: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      connectTimeout: parseInt(process.env.DB_REPLICA_CONNECT_TIMEOUT) || 60000,
      acquireTimeout: parseInt(process.env.DB_REPLICA_ACQUIRE_TIMEOUT) || 60000,
      timeout: parseInt(process.env.DB_REPLICA_TIMEOUT) || 60000,
      // SSL configuration for production
      ...(process.env.NODE_ENV === 'production' && {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      })
    },
    
    // Query configuration for reads
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
    logging: process.env.NODE_ENV === 'production' ? false : console.log,
    
    // Benchmark queries in development
    benchmark: process.env.NODE_ENV === 'development',
    
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
