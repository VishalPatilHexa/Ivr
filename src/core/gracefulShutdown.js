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

const Logger = require('../utils/logger');

class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.maxWaitTime = 10 * 60 * 1000; // 10 minutes
    this.checkInterval = 5000; // 5 seconds
    this.activeConnections = null; // Will be set via setActiveConnections()
  }

  /**
   * Set reference to activeConnections Map
   */
  setActiveConnections(activeConnections) {
    this.activeConnections = activeConnections;
  }

  /**
   * Check for active calls in activeConnections Map
   */
  async getActiveCalls() {
    try {
      if (!this.activeConnections) {
        Logger.warn('activeConnections not set');
        return [];
      }

      const activeCalls = [];

      for (const [sessionId, connection] of this.activeConnections.entries()) {
        // Check if connection is active and not ended
        if (!connection.callEnded && connection.websocket) {
          activeCalls.push({
            sessionId: sessionId,
            status: connection.agentConversation ? 'active_with_agent' : 'active',
            duration: Date.now() - connection.connectedAt.getTime(),
            clientType: connection.clientType
          });
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
      // Close all active WebSocket connections
      if (this.activeConnections) {
        for (const [sessionId, connection] of this.activeConnections.entries()) {
          if (connection.websocket && connection.websocket.readyState === 1) {
            connection.websocket.close(1001, 'Server shutting down');
            Logger.info(`🔌 Closed connection for session: ${sessionId}`);
          }
        }
        this.activeConnections.clear();
      }

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
