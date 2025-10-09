/**
 * ===============================================================================
 * KNOWLARITY CONNECTION LIFECYCLE MANAGER
 * ===============================================================================
 *
 * Handles WebSocket connection lifecycle events for Knowlarity
 * Re-exports shared lifecycle utilities with Knowlarity-specific defaults
 */

const sharedLifecycle = require("../shared/lifecycle");

/**
 * Setup WebSocket connection lifecycle handlers for Knowlarity
 */
function setupConnectionLifecycle(websocket, sessionId, activeConnections) {
  return sharedLifecycle.setupConnectionLifecycle(
    websocket,
    sessionId,
    activeConnections,
    "Knowlarity"
  );
}

// Re-export shared lifecycle functions with Knowlarity-specific wrapper
module.exports = {
  setupConnectionLifecycle,
  handleConnectionClose: sharedLifecycle.handleConnectionClose,
  handleConnectionError: sharedLifecycle.handleConnectionError,
  gracefulShutdown: sharedLifecycle.gracefulShutdown,
  checkConnectionHealth: sharedLifecycle.checkConnectionHealth,
};