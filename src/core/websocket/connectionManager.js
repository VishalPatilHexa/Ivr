// Active connections storage
const activeConnections = new Map();

/**
 * Store a new WebSocket connection
 */
function addConnection(sessionId, connectionData) {
  activeConnections.set(sessionId, {
    ...connectionData,
    connectedAt: new Date(),
  });
  console.log(`📊 Connection added. Total active: ${activeConnections.size}`);
}

/**
 * Get a connection by session ID
 */
function getConnection(sessionId) {
  return activeConnections.get(sessionId);
}

/**
 * Remove a connection
 */
function removeConnection(sessionId) {
  const existed = activeConnections.has(sessionId);
  activeConnections.delete(sessionId);
  console.log(`📊 Connection removed. Total active: ${activeConnections.size}`);
  return existed;
}

/**
 * Update connection data
 */
function updateConnection(sessionId, updates) {
  const connection = activeConnections.get(sessionId);
  if (connection) {
    Object.assign(connection, updates);
    return true;
  }
  return false;
}

/**
 * Get all active connections
 */
function getAllConnections() {
  return Array.from(activeConnections.values());
}

/**
 * Get connection count
 */
function getConnectionCount() {
  return activeConnections.size;
}

/**
 * Clean up dead connections
 */
function cleanupDeadConnections() {
  let cleanedCount = 0;
  for (const [sessionId, connection] of activeConnections) {
    if (connection.websocket?.readyState === 3) { // WebSocket.CLOSED
      removeConnection(sessionId);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} dead connections`);
  }
  return cleanedCount;
}

module.exports = {
  addConnection,
  getConnection,
  removeConnection,
  updateConnection,
  getAllConnections,
  getConnectionCount,
  cleanupDeadConnections,
};