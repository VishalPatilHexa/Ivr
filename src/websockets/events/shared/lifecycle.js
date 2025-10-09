/**
 * ===============================================================================
 * SHARED CONNECTION LIFECYCLE MANAGER
 * ===============================================================================
 *
 * Generic WebSocket connection lifecycle handlers
 * Can be used by any provider (Knowlarity, Acephone, etc.)
 */

const Logger = require("../../../utils/logger");
const streamingUtils = require("./streaming");

/**
 * Setup generic WebSocket connection lifecycle handlers
 *
 * @param {WebSocket} websocket - WebSocket connection
 * @param {string} sessionId - Session identifier
 * @param {Map} activeConnections - Active connections map
 * @param {object} sessionManager - Session manager instance (optional)
 * @param {string} providerName - Provider name for logging (e.g., "Knowlarity", "Acephone")
 */
function setupConnectionLifecycle(
  websocket,
  sessionId,
  activeConnections,
  sessionManager = null,
  providerName = "Provider"
) {
  // Handle connection close
  websocket.on("close", async (code, reason) => {
    Logger.info(`🔌 ${providerName} connection closed`, {
      sessionId,
      code,
      reason: reason?.toString(),
    });

    await handleConnectionClose(
      sessionId,
      activeConnections,
      sessionManager,
      providerName
    );
  });

  // Handle connection errors
  websocket.on("error", async (error) => {
    Logger.error(`❌ ${providerName} WebSocket error`, {
      sessionId,
      error: error.message,
    });

    await handleConnectionError(
      sessionId,
      activeConnections,
      sessionManager,
      error,
      providerName
    );
  });
}

/**
 * Handle connection close cleanup
 */
async function handleConnectionClose(
  sessionId,
  activeConnections,
  sessionManager = null,
  providerName = "Provider"
) {
  try {
    const connection = activeConnections.get(sessionId);

    // End ElevenLabs conversation if active
    if (connection?.agentConversation) {
      await streamingUtils.endConversation(sessionId);
      Logger.info(`✅ Ended ElevenLabs conversation`, { sessionId });
    }

    // Clean up session from Redis
    if (sessionManager) {
      await sessionManager.deleteSession(sessionId);
      Logger.info(`✅ Session cleaned up from Redis`, { sessionId });
    }

    // Remove from active connections
    activeConnections.delete(sessionId);
    Logger.info(`✅ ${providerName} connection cleaned up`, { sessionId });
  } catch (error) {
    Logger.error(`❌ Error during ${providerName} connection close cleanup`, {
      sessionId,
      error: error.message,
    });
  }
}

/**
 * Handle connection error cleanup
 */
async function handleConnectionError(
  sessionId,
  activeConnections,
  sessionManager = null,
  error,
  providerName = "Provider"
) {
  try {
    const connection = activeConnections.get(sessionId);

    // End ElevenLabs conversation
    if (connection?.agentConversation) {
      await streamingUtils.endConversation(sessionId);
    }

    // Update session status to failed
    if (sessionManager) {
      try {
        await sessionManager.updateSession(sessionId, {
          status: "failed",
          error: error.message,
          failedAt: Date.now(),
        });
      } catch (updateError) {
        // If update fails, try to delete the session
        await sessionManager.deleteSession(sessionId);
      }
    }

    // Remove from active connections
    activeConnections.delete(sessionId);

    Logger.error(`💥 ${providerName} connection error handled`, {
      sessionId,
      originalError: error.message,
    });
  } catch (cleanupError) {
    Logger.error(`❌ Error during ${providerName} connection error cleanup`, {
      sessionId,
      cleanupError: cleanupError.message,
      originalError: error.message,
    });
  }
}

/**
 * Graceful connection shutdown
 */
async function gracefulShutdown(
  sessionId,
  activeConnections,
  sessionManager = null,
  reason = "Server shutdown",
  providerName = "Provider"
) {
  try {
    const connection = activeConnections.get(sessionId);

    if (!connection) {
      Logger.debug(`🤷 No connection found for graceful shutdown`, { sessionId });
      return;
    }

    Logger.info(`🔄 Starting graceful shutdown`, { sessionId, reason });

    // Send shutdown notice to client
    if (connection.websocket?.readyState === 1) {
      // WebSocket.OPEN
      const shutdownMessage = {
        type: "server_shutdown",
        message: reason,
        timestamp: new Date().toISOString(),
      };

      connection.websocket.send(JSON.stringify(shutdownMessage));
    }

    // End conversation gracefully
    if (connection.agentConversation) {
      await streamingUtils.endConversation(sessionId);
    }

    // Update session status
    if (sessionManager) {
      await sessionManager.updateSession(sessionId, {
        status: "terminated",
        reason: reason,
        terminatedAt: Date.now(),
      });
    }

    // Close WebSocket connection
    if (connection.websocket?.readyState === 1) {
      connection.websocket.close(1001, reason);
    }

    // Clean up
    activeConnections.delete(sessionId);

    Logger.info(`✅ ${providerName} graceful shutdown completed`, { sessionId });
  } catch (error) {
    Logger.error(`❌ Error during ${providerName} graceful shutdown`, {
      sessionId,
      error: error.message,
    });

    // Force cleanup
    activeConnections.delete(sessionId);
  }
}

/**
 * Check connection health
 */
function checkConnectionHealth(sessionId, activeConnections) {
  const connection = activeConnections.get(sessionId);

  if (!connection) {
    return { healthy: false, reason: "Connection not found" };
  }

  const now = Date.now();
  const connectionAge = now - connection.connectedAt.getTime();
  const lastActivity = connection.lastActivity || connection.connectedAt.getTime();
  const timeSinceActivity = now - lastActivity;

  return {
    healthy: connection.websocket?.readyState === 1,
    connectionAge: Math.floor(connectionAge / 1000),
    timeSinceActivity: Math.floor(timeSinceActivity / 1000),
    agentActive: !!connection.agentConversation,
    clientType: connection.clientType,
  };
}

module.exports = {
  setupConnectionLifecycle,
  handleConnectionClose,
  handleConnectionError,
  gracefulShutdown,
  checkConnectionHealth,
};
