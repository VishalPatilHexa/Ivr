/**
 * ===============================================================================
 * WEBSOCKET EVENT ROUTER
 * ===============================================================================
 *
 * Main WebSocket connection router that delegates to provider-specific handlers
 */

const Logger = require("../../utils/logger");
const knowlarityHandler = require("./knowlarity/handler");
const acephoneHandler = require("./acephone/handler");

// Active connections storage (shared across providers)
const activeConnections = new Map();

/**
 * Main WebSocket connection handler - routes connections based on URL path
 */
function handleConnection(websocket, request) {
  try {
    Logger.info("🌐 New WebSocket connection received", {
      url: request.url,
      headers: request.headers.host
    });

    const url = new URL(request.url, `http://${request.headers.host}`);
    const urlPath = url.pathname;

    // Route to Knowlarity stream handler
    if (urlPath.startsWith("/knowlarity-stream/")) {
      Logger.info("➡️ Routing to Knowlarity handler", { path: urlPath });
      return knowlarityHandler.handleConnection(websocket, urlPath, activeConnections);
    }

    // Route to Acephone stream handler
    if (urlPath.startsWith("/acephone")) {
      Logger.info("➡️ Routing to Acephone handler", { path: urlPath });
      return acephoneHandler.handleConnection(websocket, urlPath, activeConnections);
    }

    // Reject unknown connection types
    Logger.warn("❌ Unknown connection type, closing WebSocket", { path: urlPath });
    websocket.close(1008, "Unknown connection type");

  } catch (routingError) {
    Logger.error("❌ Error in connection routing", routingError);
    websocket.close(1011, "Internal server error");
  }
}

/**
 * Get active connections (for monitoring)
 */
function getActiveConnections() {
  return activeConnections;
}

/**
 * Cleanup dead connections (periodic maintenance)
 */
function cleanup() {
  let cleanedCount = 0;
  
  activeConnections.forEach((connection, sessionId) => {
    if (connection.websocket?.readyState === 3) { // WebSocket.CLOSED
      activeConnections.delete(sessionId);
      cleanedCount++;
      Logger.debug("🧹 Cleaned up dead connection", { sessionId });
    }
  });

  if (cleanedCount > 0) {
    Logger.info(`🧹 Cleaned up ${cleanedCount} dead connections`);
  }
}

// Start periodic cleanup (every 5 minutes)
setInterval(cleanup, 5 * 60 * 1000);

module.exports = {
  handleConnection,
  getActiveConnections,
  activeConnections, // For backward compatibility
  cleanup,
};