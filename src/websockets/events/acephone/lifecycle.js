/**
 * ===============================================================================
 * ACEPHONE CONNECTION LIFECYCLE MANAGER
 * ===============================================================================
 *
 * Handles WebSocket connection lifecycle events for Acephone
 * Re-exports shared lifecycle utilities with Acephone-specific defaults
 */

const sharedLifecycle = require("../shared/lifecycle");

/**
 * Setup WebSocket connection lifecycle handlers for Acephone
 * Note: Acephone doesn't use Redis session manager, so sessionManager is null
 */
function setupConnectionLifecycle(websocket, sessionId, activeConnections) {
  return sharedLifecycle.setupConnectionLifecycle(
    websocket,
    sessionId,
    activeConnections,
    null, // Acephone doesn't use Redis session manager
    "Acephone"
  );
}

// Re-export shared lifecycle functions with Acephone-specific wrapper
module.exports = {
  setupConnectionLifecycle,
  handleConnectionClose: sharedLifecycle.handleConnectionClose,
  handleConnectionError: sharedLifecycle.handleConnectionError,
  gracefulShutdown: sharedLifecycle.gracefulShutdown,
  checkConnectionHealth: sharedLifecycle.checkConnectionHealth,
};
