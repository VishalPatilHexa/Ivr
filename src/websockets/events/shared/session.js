/**
 * ===============================================================================
 * SESSION MANAGEMENT UTILITIES
 * ===============================================================================
 *
 * Reusable session management functions for all WebSocket handlers
 */

const Logger = require("../../../utils/logger");

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

module.exports = {
  storeConnection,
  getConnection,
  updateConnection,
  removeConnection,
  isCallEnded,
  markCallEnded,
};
