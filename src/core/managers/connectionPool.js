/**
 * ===============================================================================
 * CONNECTION POOL MANAGER
 * ===============================================================================
 *
 * Production-ready connection pool for managing WebSocket connections
 * with automatic cleanup, limits, and monitoring
 */

const EventEmitter = require("events");
const Logger = require("../../utils/logger");
const { CONNECTION_POOL, WEBSOCKET, ERRORS } = require("../../constants");

class ConnectionPool extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxConnections =
      options.maxConnections || CONNECTION_POOL.MAX_CONNECTIONS;
    this.connectionTimeout =
      options.connectionTimeout || CONNECTION_POOL.CONNECTION_TIMEOUT;
    this.cleanupInterval =
      options.cleanupInterval || CONNECTION_POOL.CLEANUP_INTERVAL;
    this.maxIdleTime = options.maxIdleTime || CONNECTION_POOL.MAX_IDLE_TIME;

    // Connection storage
    this.connections = new Map();
    this.connectionsByClient = new Map(); // client -> Set of connection IDs
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      cleanedUpConnections: 0,
    };

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    Logger.info("ConnectionPool initialized", {
      maxConnections: this.maxConnections,
      connectionTimeout: this.connectionTimeout,
      cleanupInterval: this.cleanupInterval,
    });
  }

  /**
   * Add a new connection to the pool
   */
  addConnection(connectionId, websocket, clientInfo = {}) {
    if (this.connections.size >= this.maxConnections) {
      const error = new Error("Connection pool limit exceeded");
      error.code = ERRORS.CODES.POOL_LIMIT_EXCEEDED;
      Logger.warn("Connection pool limit exceeded", {
        currentConnections: this.connections.size,
        maxConnections: this.maxConnections,
        clientInfo,
      });
      throw error;
    }

    const connection = {
      id: connectionId,
      websocket,
      clientInfo,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: CONNECTION_POOL.CONNECTION_STATUS.ACTIVE,
      metadata: {},
    };

    this.connections.set(connectionId, connection);

    // Track by client type
    const clientType = clientInfo.type || WEBSOCKET.CLIENT_TYPES.UNKNOWN;
    if (!this.connectionsByClient.has(clientType)) {
      this.connectionsByClient.set(clientType, new Set());
    }
    this.connectionsByClient.get(clientType).add(connectionId);

    this.stats.totalConnections++;
    this.stats.activeConnections++;

    // Setup connection monitoring
    this.setupConnectionMonitoring(connection);

    Logger.info("Connection added to pool", {
      connectionId,
      clientType,
      totalConnections: this.stats.totalConnections,
      activeConnections: this.stats.activeConnections,
    });

    this.emit("connectionAdded", connection);
    return connection;
  }

  /**
   * Get connection from pool
   */
  getConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = Date.now();
    }
    return connection;
  }

  /**
   * Remove connection from pool
   */
  removeConnection(connectionId, reason = "manual") {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    // Remove from client tracking
    const clientType =
      connection.clientInfo.type || WEBSOCKET.CLIENT_TYPES.UNKNOWN;
    if (this.connectionsByClient.has(clientType)) {
      this.connectionsByClient.get(clientType).delete(connectionId);
      if (this.connectionsByClient.get(clientType).size === 0) {
        this.connectionsByClient.delete(clientType);
      }
    }

    // Close WebSocket if still open
    if (
      connection.websocket &&
      connection.websocket.readyState === WEBSOCKET.WEBSOCKET_STATES.OPEN
    ) {
      connection.websocket.close(WEBSOCKET.CLOSE_CODES.NORMAL, reason);
    }

    this.connections.delete(connectionId);
    this.stats.activeConnections--;

    Logger.info("Connection removed from pool", {
      connectionId,
      reason,
      activeConnections: this.stats.activeConnections,
    });

    this.emit("connectionRemoved", { connection, reason });
    return true;
  }

  /**
   * Update connection metadata
   */
  updateConnection(connectionId, metadata) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.metadata = { ...connection.metadata, ...metadata };
      connection.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Get connections by client type
   */
  getConnectionsByClient(clientType) {
    const connectionIds = this.connectionsByClient.get(clientType);
    if (!connectionIds) return [];

    return Array.from(connectionIds)
      .map((id) => this.connections.get(id))
      .filter(Boolean);
  }

  /**
   * Setup connection monitoring
   */
  setupConnectionMonitoring(connection) {
    const { websocket, id } = connection;

    websocket.on("close", () => {
      this.removeConnection(
        id,
        CONNECTION_POOL.CLEANUP_REASONS.WEBSOCKET_CLOSED
      );
    });

    websocket.on("error", (error) => {
      Logger.error(`WebSocket error for connection ${id}`, error);
      this.stats.failedConnections++;
      this.removeConnection(
        id,
        CONNECTION_POOL.CLEANUP_REASONS.WEBSOCKET_ERROR
      );
    });

    websocket.on("message", () => {
      connection.lastActivity = Date.now();
    });

    websocket.on("pong", () => {
      connection.lastActivity = Date.now();
    });
  }

  /**
   * Cleanup expired and dead connections
   */
  cleanup() {
    const now = Date.now();
    const expiredConnections = [];

    for (const [connectionId, connection] of this.connections) {
      const age = now - connection.createdAt;
      const idleTime = now - connection.lastActivity;

      // Check if connection is expired or idle
      if (age > this.connectionTimeout || idleTime > this.maxIdleTime) {
        expiredConnections.push({
          id: connectionId,
          reason:
            age > this.connectionTimeout
              ? CONNECTION_POOL.CLEANUP_REASONS.TIMEOUT
              : CONNECTION_POOL.CLEANUP_REASONS.IDLE,
        });
        continue;
      }

      // Check if WebSocket is still alive
      if (connection.websocket.readyState !== WEBSOCKET.WEBSOCKET_STATES.OPEN) {
        expiredConnections.push({
          id: connectionId,
          reason: CONNECTION_POOL.CLEANUP_REASONS.WEBSOCKET_DEAD,
        });
      }
    }

    // Remove expired connections
    expiredConnections.forEach(({ id, reason }) => {
      this.removeConnection(id, reason);
      this.stats.cleanedUpConnections++;
    });

    if (expiredConnections.length > 0) {
      Logger.info("Connection cleanup completed", {
        removedConnections: expiredConnections.length,
        totalCleanedUp: this.stats.cleanedUpConnections,
        activeConnections: this.stats.activeConnections,
      });
    }

    this.emit("cleanup", {
      removedCount: expiredConnections.length,
      stats: this.getStats(),
    });
  }

  /**
   * Health check for connection pool
   */
  healthCheck() {
    const stats = this.getStats();
    const health = {
      status: "healthy",
      stats,
      issues: [],
    };

    // Check pool utilization
    const utilization = stats.activeConnections / this.maxConnections;
    if (utilization > CONNECTION_POOL.UTILIZATION_WARNING_THRESHOLD) {
      health.status = "warning";
      health.issues.push("High connection pool utilization");
    }

    // Check error rate
    const totalOperations = stats.totalConnections;
    const errorRate =
      totalOperations > 0 ? stats.failedConnections / totalOperations : 0;
    if (errorRate > CONNECTION_POOL.ERROR_RATE_THRESHOLD) {
      health.status = "warning";
      health.issues.push("High connection failure rate");
    }

    return health;
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const connectionsByType = {};
    for (const [type, connectionIds] of this.connectionsByClient) {
      connectionsByType[type] = connectionIds.size;
    }

    return {
      ...this.stats,
      connectionsByType,
      poolUtilization: this.stats.activeConnections / this.maxConnections,
      avgConnectionAge: this.getAverageConnectionAge(),
    };
  }

  /**
   * Get average connection age
   */
  getAverageConnectionAge() {
    if (this.connections.size === 0) return 0;

    const now = Date.now();
    const totalAge = Array.from(this.connections.values()).reduce(
      (sum, conn) => sum + (now - conn.createdAt),
      0
    );

    return totalAge / this.connections.size;
  }

  /**
   * Broadcast message to all connections of a specific type
   */
  broadcast(clientType, message) {
    const connections = this.getConnectionsByClient(clientType);
    let sentCount = 0;
    let errorCount = 0;

    connections.forEach((connection) => {
      try {
        if (
          connection.websocket.readyState === WEBSOCKET.WEBSOCKET_STATES.OPEN
        ) {
          connection.websocket.send(message);
          sentCount++;
        }
      } catch (error) {
        errorCount++;
        Logger.error(
          `Failed to broadcast to connection ${connection.id}`,
          error
        );
      }
    });

    Logger.info("Broadcast completed", {
      clientType,
      sentCount,
      errorCount,
      totalConnections: connections.length,
    });

    return { sentCount, errorCount };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    Logger.info("Shutting down connection pool...");

    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Close all connections gracefully
    const closePromises = Array.from(this.connections.values()).map(
      (connection) => {
        return new Promise((resolve) => {
          if (
            connection.websocket.readyState === WEBSOCKET.WEBSOCKET_STATES.OPEN
          ) {
            connection.websocket.close(
              WEBSOCKET.CLOSE_CODES.GOING_AWAY,
              "Server shutting down"
            );
            connection.websocket.on("close", resolve);
            // Force close after 5 seconds
            setTimeout(resolve, 5000);
          } else {
            resolve();
          }
        });
      }
    );

    await Promise.all(closePromises);
    this.connections.clear();
    this.connectionsByClient.clear();

    Logger.info("Connection pool shutdown completed");
  }
}

module.exports = ConnectionPool;
