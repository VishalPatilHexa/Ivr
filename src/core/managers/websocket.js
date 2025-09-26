/**
 * ===============================================================================
 * WEBSOCKET CONNECTION MANAGEMENT
 * ===============================================================================
 *
 * Handles WebSocket connections to ElevenLabs Conversational AI
 */

const WebSocket = require("ws");
const messageProcessor = require("../../streaming/processors/message");
const Logger = require("../../utils/logger");
const { WEBSOCKET, APPLICATION } = require("../../constants");

// Environment configuration
const elevenLabsApiKey = APPLICATION.API_KEYS.ELEVENLABS;

/**
 * Create WebSocket connection to ElevenLabs Conversational AI
 */
async function createElevenLabsWebSocket(agentId, sessionId, metadata) {
  return new Promise((resolve, reject) => {
    const websocketUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;

    const agentWebSocket = new WebSocket(websocketUrl, {
      headers: { "xi-api-key": elevenLabsApiKey },
    });

    agentWebSocket.on("open", () => {
      // Initialize conversation with user context
      initializeConversation(agentWebSocket, sessionId, metadata);
      resolve(agentWebSocket);
    });

    agentWebSocket.on("message", (messageData) => {
      messageProcessor.handleElevenLabsMessage(sessionId, messageData);
    });

    agentWebSocket.on("error", (connectionError) => {
      Logger.error("ElevenLabs WebSocket error", connectionError);
      reject(connectionError);
    });

    agentWebSocket.on("close", (code, reason) => {
      // Trigger conversation end to properly close Knowlarity connection
      messageProcessor.handleConversationEnd(sessionId);
    });
  });
}

/**
 * Initialize conversation with user context and settings
 */
function initializeConversation(agentWebSocket, sessionId, metadata) {
  const initializationMessage = {
    type: "conversation_initiation_client_data",
    dynamic_variables: {
      user_name: "Patient",
      language: "hindi", 
      user_id: sessionId,
      // Pass the full metadata object directly to ElevenLabs
      ...metadata,
    },
    // Optional: Add conversation config overrides
    conversation_config_override: {
      agent: {
        language: "hi", // Set agent language to Hindi
      },
    },
  };

  agentWebSocket.send(JSON.stringify(initializationMessage));
}

/**
 * Send message to ElevenLabs WebSocket
 */
async function sendToElevenLabs(sessionId, messageToSend) {
  // Import inside function to avoid circular dependency
  const conversationManager = require("./conversation");
  const conversationSession =
    conversationManager.activeConversations.get(sessionId);

  // WEBSOCKET VALIDATION: Ensure connection to ElevenLabs is still active
  if (
    conversationSession?.agentWebSocket?.readyState ===
    WEBSOCKET.WEBSOCKET_STATES.OPEN
  ) {
    // SEND MESSAGE: Forward message to ElevenLabs agent via WebSocket
    conversationSession.agentWebSocket.send(JSON.stringify(messageToSend));
  }
}

module.exports = {
  createElevenLabsWebSocket,
  initializeConversation,
  sendToElevenLabs,
};
