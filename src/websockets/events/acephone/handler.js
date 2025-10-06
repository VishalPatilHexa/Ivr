/**
 * ===============================================================================
 * ACEPHONE STREAM HANDLER
 * ===============================================================================
 *
 * Handles Acephone WebSocket connections and audio streaming
 * TODO: Will be implemented when Acephone integration is needed
 */

const Logger = require("../../../utils/logger");
const sessionUtils = require("../shared/session");
const messageHandlers = require("../shared/messageHandlers");

/**
 * Handle Acephone WebSocket connection
 */
function handleConnection(websocket, urlPath, activeConnections) {
  // Extract sessionId from URL (adjust based on Acephone URL format)
  const sessionId = urlPath.split("/")[2] || `acephone_${Date.now()}`;
  const clientType = "acephone";

  Logger.info("🚀 Acephone handler called (basic implementation)", { sessionId });

  try {
    // Store connection using reusable utility
    sessionUtils.storeConnection(sessionId, websocket, clientType, activeConnections);

    // Setup message handling
    setupMessageHandling(websocket, sessionId, activeConnections);

    // Setup error and close handlers using reusable utilities
    messageHandlers.setupErrorHandler(websocket, sessionId, "Acephone");
    messageHandlers.setupCloseHandler(websocket, sessionId, activeConnections);

    Logger.info("✅ Acephone handler setup complete", { sessionId });
  } catch (error) {
    Logger.error("❌ Failed to setup Acephone connection", {
      sessionId,
      error,
    });
    websocket.close(1011, "Failed to initialize connection");
  }
}

/**
 * Setup message handling for Acephone connection
 */
function setupMessageHandling(websocket, sessionId, activeConnections) {
  websocket.on("message", async (message) => {
    try {
      // Parse message using reusable utility
      const parsed = messageHandlers.parseMessage(message);

      if (parsed.type === "json" || parsed.type === "text") {
        const data = parsed.type === "json" ? parsed.data : JSON.parse(parsed.data);

        Logger.info("📨 Acephone message", {
          sessionId,
          event: data.event
        });

        // Define custom handlers for Acephone events
        const handlers = {
          connected: async (data, sid) => {
            Logger.info("✅ Acephone handshake complete", { sessionId: sid });
          },

          start: async (data, sid) => {
            Logger.info("🎬 Acephone call started", { sessionId: sid });
          },

          stop: async (data, sid) => {
            Logger.info("🛑 Acephone call stopped", { sessionId: sid });
            handleCallEnd(sid, activeConnections);
          },
        };

        // Handle based on event field
        if (data.event && handlers[data.event]) {
          await handlers[data.event](data, sessionId);
        } else {
          Logger.debug("❓ Unknown Acephone event", {
            sessionId,
            event: data.event
          });
        }
      } else if (parsed.type === "binary") {
        // Handle binary audio data when Acephone audio streaming is implemented
        Logger.debug("🎵 Acephone binary audio received", { sessionId });
        // TODO: Implement audio handling when needed
      }
    } catch (error) {
      Logger.error("❌ Error processing Acephone message", {
        sessionId,
        error: error.message
      });
    }
  });
}

/**
 * Handle call end
 */
function handleCallEnd(sessionId, activeConnections) {
  // Mark call as ended using reusable utility
  sessionUtils.markCallEnded(sessionId, activeConnections);

  // Remove connection using reusable utility
  sessionUtils.removeConnection(sessionId, activeConnections);

  Logger.info("📞 Acephone call ended", { sessionId });
}

module.exports = {
  handleConnection,
};