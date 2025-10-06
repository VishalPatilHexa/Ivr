/**
 * ===============================================================================
 * KNOWLARITY STREAM HANDLER
 * ===============================================================================
 *
 * Handles Knowlarity WebSocket connections and audio streaming
 */

const Logger = require("../../../utils/logger");
const sessionUtils = require("../shared/session");
const messageHandlers = require("../shared/messageHandlers");
const agentInitializer = require("../shared/agentInitializer");
const streamingUtils = require("../shared/streaming");
const metadataProcessor = require("./metadata");
const lifecycleManager = require("./lifecycle");
const {
  updateCallEndTime,
} = require("../../../services/outboundCall");

/**
 * Handle Knowlarity WebSocket connection
 */
async function handleConnection(websocket, urlPath, activeConnections) {
  const sessionId = urlPath.split("/")[2];
  const clientType = "knowlarity";

  Logger.info("📞 New Knowlarity call", { sessionId });

  try {
    // Store connection info using reusable utility
    sessionUtils.storeConnection(sessionId, websocket, clientType, activeConnections);

    // Create session in Redis using reusable utility
    await sessionUtils.createSession(sessionId, clientType);

    // Setup message handling
    setupMessageHandling(websocket, sessionId, activeConnections);

    // Setup connection lifecycle
    lifecycleManager.setupConnectionLifecycle(
      websocket,
      sessionId,
      activeConnections,
      sessionUtils.getSessionManager()
    );

    Logger.info("✅ Knowlarity connection established", { sessionId });
  } catch (error) {
    Logger.error("❌ Failed to setup Knowlarity connection", {
      sessionId,
      error,
    });
    websocket.close(1011, "Failed to initialize connection");
  }
}


/**
 * Setup message handling for Knowlarity connection
 */
function setupMessageHandling(websocket, sessionId, activeConnections) {
  let isFirstMessage = true;
  let messageCount = 0;

  websocket.on("message", async (incomingMessage) => {
    try {
      messageCount++;

      // Check if call has ended using reusable utility
      if (sessionUtils.isCallEnded(sessionId, activeConnections)) {
        return;
      }

      // Handle initial metadata
      if (isFirstMessage) {
        isFirstMessage = false;

        const metadata = await metadataProcessor.processInitialMessage(
          incomingMessage,
          sessionId,
          sessionUtils.getSessionManager()
        );

        if (metadata) {
          await initializeAgentForKnowlarity(sessionId, metadata, activeConnections);
          return;
        } else {
          // No metadata found, initialize with defaults
          await initializeAgentForKnowlarity(sessionId, null, activeConnections);
          // Continue processing this message as audio - don't return
        }
      }

      // Handle audio and control messages
      await handleIncomingMessage(
        incomingMessage,
        sessionId,
        activeConnections
      );
    } catch (error) {
      Logger.error("❌ Error processing Knowlarity message", {
        sessionId,
        error: error.message,
      });
    }
  });

  // Setup error handler using reusable utility
  messageHandlers.setupErrorHandler(websocket, sessionId, "Knowlarity");
}

/**
 * Handle incoming messages (audio or control)
 */
async function handleIncomingMessage(
  incomingMessage,
  sessionId,
  activeConnections
) {
  const connection = sessionUtils.getConnection(sessionId, activeConnections);
  const agentConversation = connection?.agentConversation;

  // Parse message using reusable utility
  const parsed = messageHandlers.parseMessage(incomingMessage);

  if (parsed.type === "json") {
    // Try to handle as audio chunk
    const handled = await messageHandlers.handleAudioChunk(
      parsed.data,
      sessionId,
      agentConversation
    );

    if (!handled) {
      // Handle as control message
      await handleControlMessages(
        parsed.raw,
        sessionId,
        agentConversation,
        activeConnections
      );
    }
  } else if (parsed.type === "binary") {
    // Binary audio data
    await messageHandlers.handleIncomingAudio(parsed.data, sessionId, agentConversation);
  } else {
    // Text-based control messages
    await handleControlMessages(
      parsed.data,
      sessionId,
      agentConversation,
      activeConnections
    );
  }
}


/**
 * Handle control messages
 */
async function handleControlMessages(
  controlMessage,
  sessionId,
  agentConversation,
  activeConnections
) {
  // Define custom handlers for Knowlarity-specific control messages
  const handlers = {
    call_start: async (data, sid) => {
      Logger.info("📞 Call started", { sessionId: sid });
    },

    call_end: async (data, sid) => {
      Logger.info("📞 Call ended by client", { sessionId: sid });

      // Update callEndTime when call ends
      const connection = sessionUtils.getConnection(sid, activeConnections);
      if (connection?.ivrCallId) {
        await updateCallEndTime(connection.ivrCallId);
      }

      if (agentConversation) {
        streamingUtils.endConversation(sid);
      }
    },

    dtmf: async (data, sid) => {
      Logger.info("📟 DTMF received", {
        sessionId: sid,
        digit: data.digit,
      });
    },
  };

  // Use reusable control message handler
  await messageHandlers.handleControlMessage(controlMessage, sessionId, handlers);
}

/**
 * Initialize ElevenLabs agent conversation for Knowlarity
 * Uses custom metadata extraction via metadataProcessor.safeExtract
 */
async function initializeAgentForKnowlarity(sessionId, metadata, activeConnections) {
  // Custom agentId extractor for Knowlarity metadata structure
  const extractAgentId = (meta) => {
    return metadataProcessor.safeExtract(
      meta,
      "metadata.metadata.agentId",
      "metadata.agentId",
      "agentId",
      "agent_id"
    ) || "default_agent_id";
  };

  // Custom ivrCallId extractor for Knowlarity metadata structure
  const extractCallId = (meta) => {
    return metadataProcessor.safeExtract(
      meta,
      "metadata.metadata.ivrCallId",
      "metadata.ivrCallId",
      "ivrCallId"
    );
  };

  // Use reusable agent initializer with custom extractors
  await agentInitializer.initializeAgent(
    sessionId,
    metadata,
    activeConnections,
    extractAgentId,
    extractCallId
  );
}


module.exports = {
  handleConnection,
};
