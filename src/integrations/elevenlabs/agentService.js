const WebSocket = require('ws');
const config = require('../../config');
const { getConnection, removeConnection } = require('../../core/websocket/connectionManager');
const { createPlayAudioMessage } = require('../../core/audio/audioProcessor');

// Store active ElevenLabs conversations
const activeConversations = new Map();
let clientMessageHandler = null;

/**
 * Create a new conversation with ElevenLabs agent
 */
async function createConversation(sessionId, treatmentType = config.session.defaultTreatmentType, agentId = config.elevenlabs.agentId, dynamicFields = {}) {
  try {

    const agentWebSocket = new WebSocket(`${config.elevenlabs.websocketUrl}/v1/convai/conversation?agent_id=${agentId}`, {
      headers: {
        'xi-api-key': config.elevenlabs.apiKey
      }
    });

    const conversationSession = {
      sessionId,
      agentWebSocket,
      conversationId: null,
      audioFormat: null,
      isReady: false,
      treatmentType,
      agentId,
      dynamicFields
    };

    // Handle WebSocket events
    setupWebSocketHandlers(agentWebSocket, conversationSession);

    // Store conversation
    activeConversations.set(sessionId, conversationSession);

    // Wait for connection
    await waitForConnection(agentWebSocket);

    return conversationSession;

  } catch (error) {
    console.error('❌ Failed to create ElevenLabs conversation:', error.message);
    throw error;
  }
}

/**
 * Setup WebSocket event handlers for ElevenLabs connection
 */
function setupWebSocketHandlers(agentWebSocket, conversationSession) {
  agentWebSocket.on('open', () => {
    console.log(`✅ ElevenLabs WebSocket connected for session: ${conversationSession.sessionId}`);
    initializeConversation(conversationSession);
  });

  agentWebSocket.on('message', (data) => {
    handleElevenLabsMessage(data, conversationSession);
  });

  agentWebSocket.on('close', (code, reason) => {
    console.log(`🔌 ElevenLabs WebSocket closed for session: ${conversationSession.sessionId}`);
    console.log(`🔍 Close code: ${code} Reason: ${reason.toString()}`);
    
    // Clean up the conversation
    activeConversations.delete(conversationSession.sessionId);
    
    // Also close the Knowlarity connection when ElevenLabs closes
    closeKnowlarityConnection(conversationSession.sessionId);
  });

  agentWebSocket.on('error', (error) => {
    console.error(`❌ ElevenLabs WebSocket error for session ${conversationSession.sessionId}:`, error.message);
    
    // Clean up conversation on error
    activeConversations.delete(conversationSession.sessionId);
    
    // Also close Knowlarity connection on ElevenLabs error
    closeKnowlarityConnection(conversationSession.sessionId);
  });
}

/**
 * Initialize conversation with ElevenLabs agent
 */
function initializeConversation(conversationSession) {
  // Use static fields for verification - not dynamic
  const staticVariables = {
    user_id: conversationSession.sessionId,
    treatmentType: "Piles"
  };

  const initMessage = {
    type: "conversation_initiation_client_data",
    dynamic_variables: staticVariables
  };

  console.log('🔧 Using static fields for ElevenLabs:', JSON.stringify(staticVariables, null, 2));
  conversationSession.agentWebSocket.send(JSON.stringify(initMessage));
}

/**
 * Handle messages from ElevenLabs
 */
function handleElevenLabsMessage(data, conversationSession) {
  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'conversation_initiation_metadata':
        handleConversationReady(message, conversationSession);
        break;

      case 'audio':
        handleAgentAudio(message, conversationSession);
        break;

      case 'agent_response':
        handleAgentResponse(message, conversationSession);
        break;

      case 'ping':
        // Ping received - no action needed
        break;

      default:
        // Unhandled message type
    }

  } catch (error) {
    console.error('❌ Error processing ElevenLabs message:', error.message);
  }
}

/**
 * Handle conversation ready event
 */
function handleConversationReady(message, conversationSession) {
  // Store conversation metadata
  conversationSession.conversationId = message.conversation_initiation_metadata_event?.conversation_id;
  conversationSession.audioFormat = message.conversation_initiation_metadata_event?.agent_output_audio_format;
  conversationSession.isReady = true;
}

/**
 * Handle audio from ElevenLabs agent
 */
function handleAgentAudio(message, conversationSession) {
  if (clientMessageHandler) {
    const agentMessage = {
      type: "agent_audio",
      audio: message.audio_event?.audio_base_64
    };
    
    clientMessageHandler(conversationSession.sessionId, agentMessage);
  }
}

/**
 * Handle text response from agent
 */
function handleAgentResponse(message, conversationSession) {
  if (clientMessageHandler) {
    const agentMessage = {
      type: "agent_response",
      text: message.agent_response_event?.agent_response
    };
    
    clientMessageHandler(conversationSession.sessionId, agentMessage);
  }
}

/**
 * Send audio to ElevenLabs agent
 */
async function sendAudioToAgent(sessionId, audioBase64Data) {
  const conversation = activeConversations.get(sessionId);
  
  if (!conversation || !conversation.isReady) {
    console.log('⚠️ ElevenLabs conversation not ready for session:', sessionId);
    return;
  }

  const audioMessage = {
    user_audio_chunk: audioBase64Data
  };

  conversation.agentWebSocket.send(JSON.stringify(audioMessage));
}

/**
 * End conversation
 */
function endConversation(sessionId) {
  const conversation = activeConversations.get(sessionId);
  
  if (conversation) {
    console.log(`🔌 Ending ElevenLabs conversation: ${sessionId}`);
    
    if (conversation.agentWebSocket?.readyState === WebSocket.OPEN) {
      conversation.agentWebSocket.close();
    }
    
    activeConversations.delete(sessionId);
    console.log(`🧹 Conversation ended and cleaned up: ${sessionId}`);
  }
}

/**
 * Set client message handler
 */
function setClientMessageHandler(handler) {
  clientMessageHandler = handler;
  console.log('✅ Message forwarding handler registered - bridge established');
}

/**
 * Wait for WebSocket connection
 */
function waitForConnection(webSocket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 10000);

    webSocket.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });

    webSocket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Close Knowlarity connection when ElevenLabs closes
 */
function closeKnowlarityConnection(sessionId) {
  console.log(`🔌 Closing Knowlarity connection due to ElevenLabs closure: ${sessionId}`);
  
  const connection = getConnection(sessionId);
  if (connection?.websocket && connection.websocket.readyState === 1) {
    console.log(`📞 Terminating Knowlarity WebSocket for session: ${sessionId}`);
    connection.websocket.close(1000, "ElevenLabs conversation ended");
  }
  
  // Remove from connection manager
  const removed = removeConnection(sessionId);
  if (removed) {
    console.log(`🧹 Knowlarity connection cleaned up for session: ${sessionId}`);
  }
}

/**
 * Get active conversation
 */
function getConversation(sessionId) {
  return activeConversations.get(sessionId);
}

module.exports = {
  createConversation,
  sendAudioToAgent,
  endConversation,
  setClientMessageHandler,
  getConversation,
};