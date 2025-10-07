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
  // Use temporary sessionId until we get the real one from customParameters
  const tempSessionId = `acephone_temp_${Date.now()}`;
  const clientType = "acephone";

  Logger.info("🚀 Acephone handler called (basic implementation)", { tempSessionId });

  try {
    // Store connection with temporary ID
    sessionUtils.storeConnection(tempSessionId, websocket, clientType, activeConnections);

    // Setup message handling - will update sessionId when 'start' event is received
    setupMessageHandling(websocket, tempSessionId, activeConnections);

    // Setup error and close handlers using reusable utilities
    messageHandlers.setupErrorHandler(websocket, tempSessionId, "Acephone");
    messageHandlers.setupCloseHandler(websocket, tempSessionId, activeConnections);

    Logger.info("✅ Acephone handler setup complete", { tempSessionId });
  } catch (error) {
    Logger.error("❌ Failed to setup Acephone connection", {
      tempSessionId,
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

        // Print full metadata to inspect what sessionId and other info is received
        Logger.info("📨 Acephone message - FULL METADATA", {
          sessionId,
          event: data.event,
          metadata: data.metadata,
          fullData: JSON.stringify(data, null, 2),
          customParameters: data.start?.customParameters
        });

        // Define custom handlers for Acephone events
        const handlers = {
          connected: async (data, sid) => {
            Logger.info("✅ Acephone handshake complete", { sessionId: sid });
          },

          start: async (data, sid) => {
            // Extract real sessionId from customParameters.metadata.sessionId
            const realSessionId = data.start?.customParameters?.metadata?.sessionId;

            if (realSessionId) {
              Logger.info("🔄 Updating sessionId from customParameters", {
                oldSessionId: sid,
                newSessionId: realSessionId
              });

              // Get the connection data
              const connectionData = activeConnections.get(sid);

              if (connectionData) {
                // Remove old temp sessionId
                activeConnections.delete(sid);

                // Store with real sessionId
                activeConnections.set(realSessionId, {
                  ...connectionData,
                  sessionId: realSessionId
                });

                // Update the sessionId variable for subsequent handlers
                sessionId = realSessionId;
              }

              Logger.info("🎬 Acephone call started", {
                sessionId: realSessionId,
                agentId: data.start?.customParameters?.metadata?.agentId,
                treatmentType: data.start?.customParameters?.metadata?.treatmentType,
                language: data.start?.customParameters?.metadata?.language
              });
            } else {
              Logger.info("🎬 Acephone call started", { sessionId: sid });
            }
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