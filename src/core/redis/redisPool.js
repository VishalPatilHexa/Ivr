/**
 * ===============================================================================
 * REDIS CONNECTION POOL MANAGER
 * ===============================================================================
 *
 * Manages a pool of Redis connections for efficient resource utilization
 * Provides connection pooling, health monitoring, and automatic recovery
 */

const Redis = require("ioredis");
const { createPool } = require("generic-pool");
const { REDIS_POOL, ERRORS } = require("../../constants");
const Logger = require("../../utils/logger");

class RedisConnectionPool {
  constructor() {
    this.pools = new Map(); // Map of database -> pool
    this.healthCheckIntervals = new Map(); // Map of database -> interval
    this.isShuttingDown = false;

    Logger.info("Initializing Redis connection pools", {
      minConnections: REDIS_POOL.MIN_CONNECTIONS,
      maxConnections: REDIS_POOL.MAX_CONNECTIONS,
      databases: Object.keys(REDIS_POOL.DATABASES),
    });

    this.initializePools();
  }

  /**
   * Initialize pools for different databases
   */
  initializePools() {
    Object.entries(REDIS_POOL.DATABASES).forEach(([name, db]) => {
      Logger.info(`Creating Redis pool for ${name} (DB: ${db})`);

      const pool = this.createPool(db);
      this.pools.set(db, pool);

      // Start health check for this pool
      this.startHealthCheck(db, name);

      Logger.info(`Redis pool created for ${name}`, {
        database: db,
        min: REDIS_POOL.MIN_CONNECTIONS,
        max: REDIS_POOL.MAX_CONNECTIONS,
      });
    });
  }

  /**
   * Create a connection pool for a specific database
   */
  createPool(database) {
    const factory = {
      create: async () => {
        try {
          Logger.debug(`Creating new Redis connection for DB ${database}`);

          const redis = new Redis({
            ...REDIS_POOL.CONNECTION_CONFIG,
            db: database,
          });

          // Handle connection events
          redis.on("connect", () => {
            Logger.debug(`Redis connection established for DB ${database}`);
          });

          redis.on("ready", () => {
            Logger.debug(`Redis connection ready for DB ${database}`);
          });

          redis.on("error", (error) => {
            Logger.error(`Redis connection error for DB ${database}`, error);
          });

          redis.on("close", () => {
            Logger.debug(`Redis connection closed for DB ${database}`);
          });

          redis.on("reconnecting", (delay) => {
            Logger.info(`Redis reconnecting for DB ${database}`, { delay });
          });

          // Wait for connection to be ready
          await redis.ping();

          return redis;
        } catch (error) {
          Logger.error(
            `Failed to create Redis connection for DB ${database}`,
            error
          );
          throw error;
        }
      },

      destroy: async (redis) => {
        try {
          Logger.debug(`Destroying Redis connection for DB ${database}`);
          await redis.quit();
        } catch (error) {
          Logger.error(
            `Error destroying Redis connection for DB ${database}`,
            error
          );
          // Force disconnect if quit fails
          redis.disconnect();
        }
      },

      validate: async (redis) => {
        try {
          // Check if connection is still alive
          if (redis.status !== "ready") {
            return false;
          }

          await redis.ping();
          return true;
        } catch (error) {
          Logger.debug(
            `Redis connection validation failed for DB ${database}`,
            error
          );
          return false;
        }
      },
    };

    const poolConfig = {
      min: REDIS_POOL.MIN_CONNECTIONS,
      max: REDIS_POOL.MAX_CONNECTIONS,
      acquireTimeoutMillis: REDIS_POOL.ACQUIRE_TIMEOUT,
      idleTimeoutMillis: REDIS_POOL.IDLE_TIMEOUT,
      evictionRunIntervalMillis: REDIS_POOL.EVICTION_RUN_INTERVAL,
      testOnBorrow: true,
      testOnReturn: false,
    };

    return createPool(factory, poolConfig);
  }

  /**
   * Get a Redis connection from the pool
   */
  async acquire(database = REDIS_POOL.DATABASES.SESSIONS) {
    if (this.isShuttingDown) {
      throw new Error("Redis pool is shutting down");
    }

    const pool = this.pools.get(database);
    if (!pool) {
      throw new Error(`Redis pool not found for database ${database}`);
    }

    try {
      Logger.debug(`Acquiring Redis connection for DB ${database}`);
      const connection = await pool.acquire();

      // Add metadata to connection for debugging
      connection._poolDatabase = database;
      connection._acquiredAt = Date.now();

      return connection;
    } catch (error) {
      Logger.error(
        `Failed to acquire Redis connection for DB ${database}`,
        error
      );
      throw {
        code: ERRORS.CODES.REDIS_CONNECTION_FAILED,
        message: `Failed to acquire Redis connection for database ${database}`,
        original: error,
      };
    }
  }

  /**
   * Release a Redis connection back to the pool
   */
  async release(connection) {
    if (!connection || !connection._poolDatabase) {
      Logger.warn("Invalid connection provided for release");
      return;
    }

    const database = connection._poolDatabase;
    const pool = this.pools.get(database);

    if (!pool) {
      Logger.error(`Pool not found for database ${database}`);
      return;
    }

    try {
      Logger.debug(`Releasing Redis connection for DB ${database}`, {
        heldFor: Date.now() - connection._acquiredAt,
      });

      await pool.release(connection);
    } catch (error) {
      Logger.error(
        `Failed to release Redis connection for DB ${database}`,
        error
      );

      // Try to destroy the connection if release fails
      try {
        await pool.destroy(connection);
      } catch (destroyError) {
        Logger.error(
          "Failed to destroy connection after release failure",
          destroyError
        );
      }
    }
  }

  /**
   * Execute a Redis operation with automatic connection management
   */
  async execute(operation, database = REDIS_POOL.DATABASES.SESSIONS) {
    let connection = null;

    try {
      connection = await this.acquire(database);
      const result = await operation(connection);
      return result;
    } catch (error) {
      Logger.error("Redis operation failed", { database, error });
      throw error;
    } finally {
      if (connection) {
        await this.release(connection);
      }
    }
  }

  /**
   * Execute multiple Redis operations in a pipeline
   */
  async pipeline(operations, database = REDIS_POOL.DATABASES.SESSIONS) {
    return this.execute(async (redis) => {
      const pipeline = redis.pipeline();

      operations.forEach((op) => {
        pipeline[op.command](...op.args);
      });

      const results = await pipeline.exec();
      return results.map(([error, result]) => {
        if (error) throw error;
        return result;
      });
    }, database);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const stats = {};

    this.pools.forEach((pool, database) => {
      stats[database] = {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
        min: pool.min,
        max: pool.max,
      };
    });

    return stats;
  }

  /**
   * Start health check for a specific pool
   */
  startHealthCheck(database, name) {
    const interval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(interval);
        return;
      }

      try {
        await this.execute(async (redis) => {
          await redis.ping();
        }, database);

        Logger.debug(`Health check passed for ${name} (DB: ${database})`);
      } catch (error) {
        Logger.error(
          `Health check failed for ${name} (DB: ${database})`,
          error
        );
      }
    }, REDIS_POOL.HEALTH_CHECK.INTERVAL);

    this.healthCheckIntervals.set(database, interval);
  }

  /**
   * Stop all health checks
   */
  stopHealthChecks() {
    this.healthCheckIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.healthCheckIntervals.clear();
  }

  /**
   * Graceful shutdown of all pools
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    Logger.info("Shutting down Redis connection pools");
    this.isShuttingDown = true;

    // Stop health checks
    this.stopHealthChecks();

    // Drain and close all pools
    const shutdownPromises = Array.from(this.pools.entries()).map(
      async ([database, pool]) => {
        try {
          Logger.info(`Draining Redis pool for database ${database}`);
          await pool.drain();

          Logger.info(`Clearing Redis pool for database ${database}`);
          await pool.clear();

          Logger.info(`Redis pool shutdown complete for database ${database}`);
        } catch (error) {
          Logger.error(
            `Error shutting down Redis pool for database ${database}`,
            error
          );
        }
      }
    );

    await Promise.allSettled(shutdownPromises);
    this.pools.clear();

    Logger.info("All Redis pools shut down successfully");
  }
}

// Export singleton instance
const redisPool = new RedisConnectionPool();

module.exports = redisPool;
