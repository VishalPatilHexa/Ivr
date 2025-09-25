/**
 * ===============================================================================
 * WEBSOCKET STREAM HANDLER (REFACTORED)
 * ===============================================================================
 *
 * This file now delegates to the new modular architecture:
 * - src/websockets/events/index.js (main router)
 * - src/websockets/events/knowlarity/* (Knowlarity handlers)  
 * - src/websockets/events/acephone/* (Acephone handlers)
 * - src/websockets/events/shared/* (shared utilities)
 *
 * This maintains backward compatibility while using the new structure.
 */

const newEventHandler = require("./index");

/**
 * Main WebSocket connection handler (delegates to new architecture)
 */
function handleConnection(websocket, request) {
  return newEventHandler.handleConnection(websocket, request);
}

/**
 * Get active connections (backward compatibility)
 */
function getActiveConnections() {
  return newEventHandler.getActiveConnections();
}

/**
 * Active connections map (backward compatibility)  
 */
const activeConnections = newEventHandler.activeConnections;

/**
 * Cleanup function (backward compatibility)
 */
function cleanup() {
  return newEventHandler.cleanup();
}

/**
 * Legacy function exports (for any remaining imports)
 */
function cleanupSession(sessionId) {
  // Delegate to new architecture
  const connection = activeConnections.get(sessionId);
  if (connection) {
    activeConnections.delete(sessionId);
  }
}

// Export functions for backward compatibility
module.exports = {
  handleConnection,
  activeConnections, 
  getActiveConnections,
  cleanupSession,
  cleanup,
};