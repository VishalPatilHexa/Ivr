/**
 * ===============================================================================
 * AGENT INITIALIZATION UTILITIES
 * ===============================================================================
 *
 * Reusable agent conversation initialization for ElevenLabs integration
 */

const WebSocket = require("ws");
const Logger = require("../../../utils/logger");
const elevenLabsAgentService = require("../../../streaming/adapters/elevenlabs");
const streamingUtils = require("./streaming");
const {
  updateCallStartTime,
} = require("../../../services/outboundCall");

/**
 * Initialize ElevenLabs agent conversation
 *
 * @param {string} sessionId - Session identifier
 * @param {object} metadata - Metadata containing agentId, ivrCallId, etc.
 * @param {Map} activeConnections - Active connections map
 * @param {function} extractAgentId - Custom function to extract agentId from metadata
 * @param {function} extractCallId - Custom function to extract ivrCallId from metadata
 * @returns {Promise<object>} Agent conversation object
 */
async function initializeAgent(
  sessionId,
  metadata,
  activeConnections,
  extractAgentId = null,
  extractCallId = null
) {
  try {
    Logger.info("🤖 Initializing ElevenLabs agent", { sessionId });

    // Extract agentId using custom extractor or default logic
    const agentId = extractAgentId
      ? extractAgentId(metadata)
      : getDefaultAgentId(metadata);

    // Log the agentId status
    if (agentId === "default_agent_id") {
      Logger.warn("⚠️ Using default agentId", { sessionId });
    } else {
      Logger.info("✅ Valid agentId extracted from metadata", {
        sessionId,
        agentId,
      });
    }

    // Create ElevenLabs conversation
    const agentConversation = await elevenLabsAgentService.createConversation(
      agentId,
      sessionId,
      metadata
    );

    // Extract ivrCallId using custom extractor or default logic
    const ivrCallId = extractCallId
      ? extractCallId(metadata)
      : getDefaultCallId(metadata);

    // Update call start time if ivrCallId exists
    if (ivrCallId) {
      await updateCallStartTime(ivrCallId);
    }

    // Store agent conversation and ivrCallId in connection
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.agentConversation = agentConversation;
      connection.ivrCallId = ivrCallId;
    }

    // Setup bidirectional audio streaming
    streamingUtils.setupAudioStreaming(sessionId, activeConnections);

    // Send acknowledgment to client
    await sendAgentReadyMessage(connection);

    Logger.info("✅ Agent initialized successfully", { sessionId });
    return agentConversation;
  } catch (error) {
    Logger.error("❌ Failed to initialize agent", { sessionId, error });

    // Close connection on initialization failure
    const connection = activeConnections.get(sessionId);
    if (connection?.websocket?.readyState === WebSocket.OPEN) {
      connection.websocket.close(1011, "Failed to initialize conversation");
    }

    throw error;
  }
}

/**
 * Default agentId extractor using safeExtract pattern
 */
function getDefaultAgentId(metadata) {
  if (!metadata) return "default_agent_id";

  // Check multiple possible paths for agentId
  const paths = [
    metadata?.metadata?.metadata?.agentId,
    metadata?.metadata?.agentId,
    metadata?.agentId,
    metadata?.agent_id,
  ];

  for (const agentId of paths) {
    if (agentId) return agentId;
  }

  return "default_agent_id";
}

/**
 * Default ivrCallId extractor using safeExtract pattern
 */
function getDefaultCallId(metadata) {
  if (!metadata) return null;

  // Check multiple possible paths for ivrCallId
  const paths = [
    metadata?.metadata?.metadata?.ivrCallId,
    metadata?.metadata?.ivrCallId,
    metadata?.ivrCallId,
    metadata?.callId,
    metadata?.call_id,
  ];

  for (const callId of paths) {
    if (callId) return callId;
  }

  return null;
}

/**
 * Send agent ready messages to client
 */
async function sendAgentReadyMessage(connection) {
  if (!connection?.websocket || connection.websocket.readyState !== WebSocket.OPEN) {
    return;
  }

  // Send metadata acknowledgment
  const ackMessage = JSON.stringify({
    type: "metadata_received",
    status: "success",
    message: "Metadata processed successfully",
  });
  connection.websocket.send(ackMessage);

  // Send agent ready notification
  const readyMessage = JSON.stringify({
    type: "agent_ready",
    message: "ElevenLabs agent is ready for conversation",
  });
  connection.websocket.send(readyMessage);
}

/**
 * Initialize agent with default extractors (backward compatibility)
 */
async function initializeAgentWithDefaults(sessionId, metadata, activeConnections) {
  return initializeAgent(sessionId, metadata, activeConnections);
}

module.exports = {
  initializeAgent,
  initializeAgentWithDefaults,
  getDefaultAgentId,
  getDefaultCallId,
  sendAgentReadyMessage,
};
