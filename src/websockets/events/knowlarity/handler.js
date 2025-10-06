/**
 * ===============================================================================
 * KNOWLARITY STREAM HANDLER
 * ===============================================================================
 *
 * Handles Knowlarity WebSocket connections and audio streaming
 */

const WebSocket = require("ws");
const Logger = require("../../../utils/logger");
const { SessionManager } = require("../../../core/managers");
const audioUtils = require("../shared/audio");
const streamingUtils = require("../shared/streaming");
const metadataProcessor = require("./metadata");
const lifecycleManager = require("./lifecycle");
const elevenLabsAgentService = require("../../../streaming/adapters/elevenlabs");
const {
  updateCallStartTime,
  updateCallEndTime,
} = require("../../../services/outboundCall");

// Initialize SessionManager
const sessionManager = new SessionManager();
sessionManager.initialize();

/**
 * Handle Knowlarity WebSocket connection
 */
async function handleConnection(websocket, urlPath, activeConnections) {
  const sessionId = urlPath.split("/")[2];

  Logger.info("📞 New Knowlarity call", { sessionId });

  try {
    // Store connection info
    const clientType = "knowlarity";

    activeConnections.set(sessionId, {
      websocket,
      clientType,
      connectedAt: new Date(),
      agentConversation: null,
    });

    // Create session in Redis
    await createSession(sessionId, clientType);

    // Setup message handling
    setupMessageHandling(websocket, sessionId, activeConnections);

    // Setup connection lifecycle
    lifecycleManager.setupConnectionLifecycle(
      websocket,
      sessionId,
      activeConnections,
      sessionManager
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
 * Create session in Redis
 */
async function createSession(sessionId, clientType) {
  try {
    const session = await sessionManager.createSession({
      sessionId: sessionId,
      clientInfo: {
        type: clientType,
        userAgent: "knowlarity-websocket",
        ipAddress: "knowlarity-gateway",
      },
      metadata: {
        callType: "inbound",
        source: "knowlarity",
        isExternal: true,
      },
    });

    Logger.info("✅ Session created in Redis", { sessionId });
    return session;
  } catch (error) {
    Logger.error("❌ Failed to create session", { sessionId, error });
    throw error;
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

      // Check if call has ended
      const connection = activeConnections.get(sessionId);
      if (connection?.callEnded) {
        return;
      }

      // Handle initial metadata
      if (isFirstMessage) {
        isFirstMessage = false;

        const metadata = await metadataProcessor.processInitialMessage(
          incomingMessage,
          sessionId,
          sessionManager
        );

        if (metadata) {
          await initializeAgent(sessionId, metadata, activeConnections);
          return;
        } else {
          // No metadata found, initialize with defaults
          await initializeAgent(sessionId, null, activeConnections);
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

  websocket.on("error", (error) => {
    Logger.error("❌ Knowlarity WebSocket error", {
      sessionId,
      error: error.message,
    });
  });
}

/**
 * Handle incoming messages (audio or control)
 */
async function handleIncomingMessage(
  incomingMessage,
  sessionId,
  activeConnections
) {
  const connection = activeConnections.get(sessionId);
  const agentConversation = connection?.agentConversation;

  if (incomingMessage instanceof Buffer) {
    // Try to parse as JSON first
    try {
      const messageStr = incomingMessage.toString();
      const parsedMessage = JSON.parse(messageStr);

      if (parsedMessage.type === "audio-chunk" && parsedMessage.audio) {
        // Handle client audio message
        const audioBuffer = Buffer.from(parsedMessage.audio, "base64");
        await handleIncomingAudio(audioBuffer, sessionId, agentConversation);
      } else {
        // Handle control messages
        await handleControlMessages(
          messageStr,
          sessionId,
          agentConversation,
          activeConnections
        );
      }
    } catch (parseError) {
      // Not JSON, treat as binary audio
      await handleIncomingAudio(incomingMessage, sessionId, agentConversation);
    }
  } else {
    // Handle text-based control messages
    await handleControlMessages(
      incomingMessage,
      sessionId,
      agentConversation,
      activeConnections
    );
  }
}

/**
 * Handle incoming audio from caller
 */
async function handleIncomingAudio(audioBuffer, sessionId, agentConversation) {
  try {
    // Amplify audio volume
    const amplifiedAudioBuffer = audioUtils.amplifyAudioVolume(
      audioBuffer,
      2.5
    );
    const audioBase64Data = amplifiedAudioBuffer.toString("base64");

    // Send to ElevenLabs agent
    if (agentConversation) {
      await streamingUtils.sendAudioToAgent(sessionId, audioBase64Data);
    } else {
      Logger.debug("⏳ Agent not ready, dropping audio", { sessionId });
    }
  } catch (error) {
    Logger.error("❌ Failed to process incoming audio", { sessionId, error });
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
  try {
    const controlData = JSON.parse(controlMessage);

    switch (controlData.type) {
      case "call_start":
        Logger.info("📞 Call started", { sessionId });
        break;

      case "call_end":
        Logger.info("📞 Call ended by client", { sessionId });

        // Update callEndTime when call ends
        const connection = activeConnections.get(sessionId);
        if (connection && connection.ivrCallId) {
          await updateCallEndTime(connection.ivrCallId);
        }

        if (agentConversation) {
          streamingUtils.endConversation(sessionId);
        }
        break;

      case "dtmf":
        Logger.info("📟 DTMF received", {
          sessionId,
          digit: controlData.digit,
        });
        break;

      default:
        Logger.debug("❓ Unknown control message", {
          sessionId,
          type: controlData.type,
        });
    }
  } catch (jsonError) {
    Logger.debug("📝 Non-JSON control message", { sessionId });
  }
}

/**
 * Initialize ElevenLabs agent conversation
 */
async function initializeAgent(sessionId, metadata, activeConnections) {
  try {
    Logger.info("🤖 Initializing ElevenLabs agent", { sessionId });

    // Extract only agentId for ElevenLabs connection, pass full metadata for processing there
    const agentId =
      metadataProcessor.safeExtract(
        metadata,
        "metadata.metadata.agentId",
        "metadata.agentId",
        "agentId",
        "agent_id"
      ) || "default_agent_id";

    // Log the agentId status
    if (agentId === "default_agent_id") {
      Logger.warn("⚠️ Using default agentId", { sessionId });
    } else {
      Logger.info("✅ Valid agentId extracted from metadata", {
        sessionId,
        agentId,
      });
    }

    // Create ElevenLabs conversation - pass full metadata for destructuring there
    const agentConversation = await elevenLabsAgentService.createConversation(
      agentId,
      sessionId,
      metadata // Pass full metadata object for ElevenLabs to destructure
    );

    // Extract ivrCallId and update callStartTime
    const ivrCallId = metadataProcessor.safeExtract(
      metadata,
      "metadata.metadata.ivrCallId",
      "metadata.ivrCallId",
      "ivrCallId"
    );

    if (ivrCallId) {
      await updateCallStartTime(ivrCallId);
    }

    // Store agent conversation and ivrCallId
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.agentConversation = agentConversation;
      connection.ivrCallId = ivrCallId; // Store only ivrCallId for later access
    }

    // Setup bidirectional audio streaming
    streamingUtils.setupAudioStreaming(sessionId, activeConnections);

    // Send acknowledgment to Knowlarity
    await sendSuccessResponse(connection);

    // Notify client that agent is ready
    if (connection?.websocket?.readyState === WebSocket.OPEN) {
      connection.websocket.send(
        JSON.stringify({
          type: "agent_ready",
          message: "ElevenLabs agent is ready for conversation",
        })
      );
    }

    Logger.info("✅ Agent initialized successfully", { sessionId });
  } catch (error) {
    Logger.error("❌ Failed to initialize agent", { sessionId, error });

    // Close connection on initialization failure
    const connection = activeConnections.get(sessionId);
    if (connection?.websocket?.readyState === WebSocket.OPEN) {
      connection.websocket.close(1011, "Failed to initialize conversation");
    }
  }
}

/**
 * Send success response to Knowlarity
 */
async function sendSuccessResponse(connection) {
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    const ackMessage = JSON.stringify({
      type: "metadata_received",
      status: "success",
      message: "Metadata processed successfully",
    });

    connection.websocket.send(ackMessage);
  }
}

module.exports = {
  handleConnection,
};
