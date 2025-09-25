/**
 * ===============================================================================
 * GRACEFUL SHUTDOWN HANDLER
 * ===============================================================================
 *
 * Handles graceful application shutdown by:
 * 1. Checking for active calls
 * 2. Waiting for calls to complete
 * 3. Force shutdown after timeout
 */

const redisPool = require('./redis/redisPool');
const { REDIS_POOL } = require('../constants');
const Logger = require('../utils/logger');

class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.maxWaitTime = 10 * 60 * 1000; // 10 minutes
    this.checkInterval = 5000; // 5 seconds
  }

  /**
   * Check for active calls in Redis
   */
  async getActiveCalls() {
    try {
      const sessionKeys = await redisPool.execute(async (redis) => {
        return await redis.keys('ivr:session:*');
      }, REDIS_POOL.DATABASES.SESSIONS);

      const activeCalls = [];

      for (const sessionKey of sessionKeys) {
        const sessionData = await redisPool.execute(async (redis) => {
          return await redis.get(sessionKey);
        }, REDIS_POOL.DATABASES.SESSIONS);

        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.status === 'active' || session.status === 'active_with_metadata') {
            activeCalls.push({
              sessionId: session.id,
              status: session.status,
              duration: Date.now() - session.createdAt,
              clientType: session.clientInfo?.type
            });
          }
        }
      }

      return activeCalls;
    } catch (error) {
      Logger.error('Failed to get active calls', error);
      return [];
    }
  }

  /**
   * Wait for all active calls to complete
   */
  async waitForCallsToComplete() {
    const startTime = Date.now();
    
    Logger.info('⏳ Waiting for active calls to complete before shutdown...');

    return new Promise((resolve) => {
      const checkCalls = async () => {
        const activeCalls = await this.getActiveCalls();
        const elapsedTime = Date.now() - startTime;

        if (activeCalls.length === 0) {
          Logger.info('✅ All calls completed. Safe to shutdown.');
          resolve(true);
          return;
        }

        if (elapsedTime >= this.maxWaitTime) {
          Logger.warn(`⚠️ Maximum wait time (${this.maxWaitTime/1000}s) reached. Force shutdown with ${activeCalls.length} active calls.`);
          Logger.warn('Active calls that will be terminated:', activeCalls);
          resolve(false);
          return;
        }

        Logger.info(`📞 Still ${activeCalls.length} active calls. Waiting... (${Math.round(elapsedTime/1000)}s/${this.maxWaitTime/1000}s)`);
        
        // Log call details
        activeCalls.forEach(call => {
          Logger.info(`   - ${call.sessionId}: ${call.status} (${Math.round(call.duration/1000)}s)`);
        });

        setTimeout(checkCalls, this.checkInterval);
      };

      checkCalls();
    });
  }

  /**
   * Perform graceful shutdown
   */
  async performGracefulShutdown(signal) {
    if (this.isShuttingDown) {
      Logger.warn('Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    Logger.info(`🔄 Received ${signal}. Starting graceful shutdown...`);

    try {
      // Check for active calls
      const activeCalls = await this.getActiveCalls();

      if (activeCalls.length === 0) {
        Logger.info('✅ No active calls found. Shutting down immediately.');
        await this.cleanup();
        process.exit(0);
      }

      Logger.info(`📞 Found ${activeCalls.length} active calls. Waiting for completion...`);
      
      // Wait for calls to complete or timeout
      await this.waitForCallsToComplete();
      
      // Cleanup and exit
      await this.cleanup();
      process.exit(0);

    } catch (error) {
      Logger.error('Error during graceful shutdown:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Cleanup resources before shutdown
   */
  async cleanup() {
    Logger.info('🧹 Cleaning up resources...');
    
    try {
      // Shutdown Redis pools
      await redisPool.shutdown();
      Logger.info('✅ Redis pools shut down');

      // Add any other cleanup here
      Logger.info('✅ Cleanup completed');
    } catch (error) {
      Logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Register shutdown handlers
   */
  register() {
    // Handle graceful shutdown signals
    process.on('SIGTERM', () => this.performGracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.performGracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught Exception:', error);
      this.performGracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      Logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.performGracefulShutdown('UNHANDLED_REJECTION');
    });

    Logger.info('✅ Graceful shutdown handlers registered');
  }

  /**
   * Force shutdown (for emergency)
   */
  forceShutdown() {
    Logger.warn('⚠️ Force shutdown initiated');
    process.exit(1);
  }
}

// Export singleton instance
module.exports = new GracefulShutdown();