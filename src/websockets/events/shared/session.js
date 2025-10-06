/**
 * ===============================================================================
 * SESSION MANAGEMENT UTILITIES
 * ===============================================================================
 *
 * Reusable session management functions for all WebSocket handlers
 */

const Logger = require("../../../utils/logger");
const { SessionManager } = require("../../../core/managers");

// Initialize SessionManager singleton
const sessionManager = new SessionManager();
sessionManager.initialize();

/**
 * Store connection information in activeConnections map
 */
function storeConnection(sessionId, websocket, clientType, activeConnections, additionalData = {}) {
  activeConnections.set(sessionId, {
    websocket,
    clientType,
    connectedAt: new Date(),
    agentConversation: null,
    ...additionalData,
  });

  Logger.info("✅ Connection stored", { sessionId, clientType });
}

/**
 * Create session in Redis
 */
async function createSession(sessionId, clientType, metadata = {}) {
  try {
    const session = await sessionManager.createSession({
      sessionId: sessionId,
      clientInfo: {
        type: clientType,
        userAgent: `${clientType}-websocket`,
        ipAddress: `${clientType}-gateway`,
      },
      metadata: {
        callType: "inbound",
        source: clientType,
        isExternal: true,
        ...metadata,
      },
    });

    Logger.info("✅ Session created in Redis", { sessionId });
    return session;
  } catch (error) {
    Logger.error("❌ Failed to create session", { sessionId, error });
    throw error;
  }
}

/**
 * Get connection from activeConnections map
 */
function getConnection(sessionId, activeConnections) {
  return activeConnections.get(sessionId);
}

/**
 * Update connection data
 */
function updateConnection(sessionId, activeConnections, updates) {
  const connection = activeConnections.get(sessionId);
  if (connection) {
    Object.assign(connection, updates);
    Logger.debug("📝 Connection updated", { sessionId, updates: Object.keys(updates) });
  }
}

/**
 * Remove connection from activeConnections map
 */
function removeConnection(sessionId, activeConnections) {
  const deleted = activeConnections.delete(sessionId);
  if (deleted) {
    Logger.info("🗑️ Connection removed", { sessionId });
  }
  return deleted;
}

/**
 * Check if call has ended
 */
function isCallEnded(sessionId, activeConnections) {
  const connection = activeConnections.get(sessionId);
  return connection?.callEnded === true;
}

/**
 * Mark call as ended
 */
function markCallEnded(sessionId, activeConnections) {
  const connection = activeConnections.get(sessionId);
  if (connection) {
    connection.callEnded = true;
    Logger.info("📞 Call marked as ended", { sessionId });
  }
}

/**
 * Get session manager instance
 */
function getSessionManager() {
  return sessionManager;
}

module.exports = {
  storeConnection,
  createSession,
  getConnection,
  updateConnection,
  removeConnection,
  isCallEnded,
  markCallEnded,
  getSessionManager,
};
