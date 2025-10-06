/**
 * ===============================================================================
 * SESSION CLEANUP UTILITY
 * ===============================================================================
 *
 * Reusable utilities for cleaning up WebSocket connections and sessions
 */

const Logger = require("../../utils/logger");

/**
 * Close WebSocket connection safely
 */
function closeWebSocketConnection(websocket, reason = "Call ended") {
  if (!websocket) {
    return false;
  }

  try {
    // Check if WebSocket is still open (readyState === 1)
    if (websocket.readyState === 1) {
      Logger.info("🔌 Closing WebSocket connection", { reason });
      websocket.close(1000, reason);
      return true;
    } else {
      Logger.debug("⚠️ WebSocket already closed or closing", {
        readyState: websocket.readyState,
      });
      return false;
    }
  } catch (error) {
    Logger.error("❌ Error closing WebSocket", {
      error: error.message,
    });
    return false;
  }
}

/**
 * Perform session cleanup after webhook processing
 */
function cleanupSession(sessionId, agentConversation, cleanupFn = null) {
  try {
    Logger.info("🧹 Performing session cleanup", { sessionId });

    // Call custom cleanup function if provided
    if (cleanupFn && typeof cleanupFn === "function") {
      cleanupFn(sessionId, agentConversation);
    }

    Logger.info("✅ Session cleanup completed", { sessionId });
    return true;
  } catch (error) {
    Logger.error("❌ Error during session cleanup", {
      sessionId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Handle connection cleanup after webhook
 */
function handleConnectionCleanup(connection, sessionId, cleanupFn = null) {
  if (!connection) {
    Logger.warn("⚠️ No connection found for cleanup", { sessionId });
    return false;
  }

  try {
    // Close WebSocket if still active
    const closed = closeWebSocketConnection(
      connection.websocket,
      "Call ended by ElevenLabs agent"
    );

    if (closed) {
      Logger.info("✅ WebSocket connection closed", { sessionId });
    }

    // Perform additional cleanup
    const cleaned = cleanupSession(
      sessionId,
      connection.agentConversation,
      cleanupFn
    );

    return cleaned;
  } catch (error) {
    Logger.error("❌ Error handling connection cleanup", {
      sessionId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Update call record with extracted data
 */
async function updateCallRecordWithData(
  sessionId,
  extractedValues,
  updateFn,
  status
) {
  try {
    await updateFn(sessionId, {
      extractedJson: extractedValues,
      status: status,
    });

    Logger.info("✅ Call record updated successfully", { sessionId });
    return true;
  } catch (error) {
    Logger.error("❌ Failed to update call record", {
      sessionId,
      error: error.message,
    });
    return false;
  }
}

module.exports = {
  closeWebSocketConnection,
  cleanupSession,
  handleConnectionCleanup,
  updateCallRecordWithData,
};
