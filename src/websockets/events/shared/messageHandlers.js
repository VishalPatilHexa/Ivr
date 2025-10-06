/**
 * ===============================================================================
 * MESSAGE HANDLING UTILITIES
 * ===============================================================================
 *
 * Reusable message handling functions for WebSocket audio and control messages
 */

const Logger = require("../../../utils/logger");
const audioUtils = require("./audio");
const streamingUtils = require("./streaming");

/**
 * Handle incoming audio from caller
 */
async function handleIncomingAudio(audioBuffer, sessionId, agentConversation, amplificationFactor = 2.5) {
  try {
    // Amplify audio volume
    const amplifiedAudioBuffer = audioUtils.amplifyAudioVolume(
      audioBuffer,
      amplificationFactor
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
 * Parse incoming message (try JSON first, fallback to binary)
 */
function parseMessage(incomingMessage) {
  if (!(incomingMessage instanceof Buffer)) {
    return { type: "text", data: incomingMessage };
  }

  try {
    const messageStr = incomingMessage.toString();
    const parsedMessage = JSON.parse(messageStr);
    return { type: "json", data: parsedMessage, raw: messageStr };
  } catch (parseError) {
    // Not JSON, treat as binary audio
    return { type: "binary", data: incomingMessage };
  }
}

/**
 * Handle audio chunk messages (structured JSON format)
 */
async function handleAudioChunk(parsedMessage, sessionId, agentConversation) {
  if (parsedMessage.type === "audio-chunk" && parsedMessage.audio) {
    const audioBuffer = Buffer.from(parsedMessage.audio, "base64");
    await handleIncomingAudio(audioBuffer, sessionId, agentConversation);
    return true;
  }
  return false;
}

/**
 * Generic control message handler
 * Accepts custom handlers for different message types
 */
async function handleControlMessage(messageStr, sessionId, handlers = {}) {
  try {
    const controlData = JSON.parse(messageStr);

    // Execute handler for this message type if exists
    if (handlers[controlData.type]) {
      await handlers[controlData.type](controlData, sessionId);
      return true;
    }

    // Default logging for unknown types
    Logger.debug("❓ Unknown control message", {
      sessionId,
      type: controlData.type,
    });
    return false;
  } catch (jsonError) {
    Logger.debug("📝 Non-JSON control message", { sessionId });
    return false;
  }
}

/**
 * Setup standard WebSocket error handler
 */
function setupErrorHandler(websocket, sessionId, clientType) {
  websocket.on("error", (error) => {
    Logger.error(`❌ ${clientType} WebSocket error`, {
      sessionId,
      error: error.message,
    });
  });
}

/**
 * Setup standard WebSocket close handler
 */
function setupCloseHandler(websocket, sessionId, activeConnections, onClose = null) {
  websocket.on("close", () => {
    Logger.info("🔌 Connection closed", { sessionId });
    activeConnections.delete(sessionId);

    if (onClose) {
      onClose(sessionId);
    }
  });
}

/**
 * Send JSON message to client
 */
function sendJsonMessage(websocket, messageType, data = {}) {
  if (websocket?.readyState === 1) { // WebSocket.OPEN
    const message = JSON.stringify({
      type: messageType,
      ...data,
    });
    websocket.send(message);
    return true;
  }
  return false;
}

/**
 * Send acknowledgment message
 */
function sendAcknowledgment(websocket, message = "Message received successfully") {
  return sendJsonMessage(websocket, "acknowledgment", {
    status: "success",
    message,
  });
}

module.exports = {
  handleIncomingAudio,
  parseMessage,
  handleAudioChunk,
  handleControlMessage,
  setupErrorHandler,
  setupCloseHandler,
  sendJsonMessage,
  sendAcknowledgment,
};
