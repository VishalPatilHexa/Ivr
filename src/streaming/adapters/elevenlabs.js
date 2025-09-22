/*
 * ===============================================================================
 * ELEVENLABS CONVERSATIONAL AI ADAPTER
 * ===============================================================================
 *
 * PURPOSE: Main interface for ElevenLabs AI agent integration
 * 
 * This adapter coordinates between different modules:
 * - Conversation management
 * - Audio processing  
 * - Client communication bridge
 *
 * WORKFLOW:
 * 1. Create conversation session with ElevenLabs API
 * 2. Establish WebSocket connection for real-time audio streaming
 * 3. Handle bidirectional audio/text communication
 * 4. Process agent responses and forward to calling system
 *
 * ===============================================================================
 */

const conversationManager = require('../managers/conversation');
const audioProcessor = require('../processors/audio');
const clientBridge = require('../bridges/client');

/**
 * ===============================================================================
 * MAIN API FUNCTIONS
 * ===============================================================================
 */

/**
 * Create new conversation session with ElevenLabs
 */
async function createConversation(agentId, sessionId, patientQuery) {
  return await conversationManager.createConversation(agentId, sessionId, patientQuery);
}

/**
 * Send audio chunk to ElevenLabs agent
 */
async function sendAudioToAgent(sessionId, audioData) {
  return await audioProcessor.sendAudioToAgent(sessionId, audioData);
}

/**
 * Send text message to ElevenLabs agent
 */
async function sendTextToAgent(sessionId, textContent) {
  return await audioProcessor.sendTextToAgent(sessionId, textContent);
}

/**
 * Set handler for messages to be forwarded to calling system
 */
function setClientMessageHandler(messageHandler) {
  return clientBridge.setClientMessageHandler(messageHandler);
}

/**
 * End conversation and cleanup resources
 */
async function endConversation(sessionId) {
  return await conversationManager.endConversation(sessionId);
}

/**
 * Get conversation details
 */
function getConversation(sessionId) {
  return conversationManager.getConversation(sessionId);
}

/**
 * Get conversation status
 */
async function getConversationStatus(sessionId) {
  return await conversationManager.getConversationStatus(sessionId);
}

module.exports = {
  createConversation,
  sendAudioToAgent,
  sendTextToAgent,
  setClientMessageHandler,
  endConversation,
  getConversation,
  getConversationStatus,
};
