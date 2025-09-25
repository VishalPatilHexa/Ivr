/**
 * ===============================================================================
 * CONVERSATION MANAGEMENT
 * ===============================================================================
 *
 * Manages ElevenLabs conversation sessions and lifecycle
 */

const Logger = require("../../utils/logger");
const { SESSION_MANAGER } = require("../../constants");

// websocketManager imported inside function to avoid circular dependency

// Active conversations storage
const activeConversations = new Map();

/**
 * Create new conversation session with ElevenLabs
 */
async function createConversation(agentId, sessionId, patientQuery) {
  try {
    const conversationSession = {
      sessionId,
      patientQuery,
      patientData: { query: patientQuery },
      status: SESSION_MANAGER.CONVERSATION_STATUS.ACTIVE,
      createdAt: new Date(),
      agentWebSocket: null,
    };

    activeConversations.set(sessionId, conversationSession);

    // Establish WebSocket connection to ElevenLabs
    const websocketManager = require("./websocket");
    const agentWebSocket = await websocketManager.createElevenLabsWebSocket(
      agentId,
      sessionId,
      patientQuery
    );
    conversationSession.agentWebSocket = agentWebSocket;

    return conversationSession;
  } catch (error) {
    Logger.error("Error creating conversation", error);
    throw error;
  }
}

/**
 * End conversation and cleanup resources
 */
async function endConversation(sessionId) {
  const conversationSession = activeConversations.get(sessionId);
  if (conversationSession) {
    if (conversationSession.agentWebSocket) {
      conversationSession.agentWebSocket.close();
    }
    conversationSession.status = SESSION_MANAGER.CONVERSATION_STATUS.TERMINATED;
    activeConversations.delete(sessionId);
  }
}

/**
 * Get conversation details
 */
function getConversation(sessionId) {
  return activeConversations.get(sessionId);
}

/**
 * Get conversation status
 */
async function getConversationStatus(sessionId) {
  const conversationSession = activeConversations.get(sessionId);
  if (!conversationSession) return null;

  return {
    sessionId,
    status: conversationSession.status,
    patientData: conversationSession.patientData,
    createdAt: conversationSession.createdAt,
  };
}

module.exports = {
  createConversation,
  endConversation,
  getConversation,
  getConversationStatus,
  activeConversations,
};
