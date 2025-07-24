const WebSocket = require('ws');

/*
 * ===============================================================================
 * ELEVENLABS CONVERSATIONAL AI AGENT
 * =============================================================================== 
 * 
 * PURPOSE: Manages real-time voice conversations with ElevenLabs AI agents
 * 
 * WORKFLOW:
 * 1. Create conversation session with ElevenLabs API
 * 2. Establish WebSocket connection for real-time audio streaming  
 * 3. Handle bidirectional audio/text communication
 * 4. Process agent responses and forward to calling system
 * 
 * AUDIO FLOW:
 * - INPUT: Receives base64 audio chunks from caller
 * - OUTPUT: Streams agent audio responses back to caller
 * - FORMATS: Handles PCM/base64 audio conversion
 * 
 * ===============================================================================
 */

// Environment configuration
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const elevenLabsAgentId = process.env.ELEVENLABS_AGENT_ID;

// Active conversations storage
const activeConversations = new Map();
let messageForwardingHandler = null;

/**
 * Validate required environment variables on startup
 */
function validateEnvironment() {
  if (!elevenLabsApiKey) {
    throw new Error('ELEVENLABS_API_KEY is required');
  }
  if (!elevenLabsAgentId) {
    throw new Error('ELEVENLABS_AGENT_ID is required');
  }
  
  console.log('✅ ElevenLabs Agent initialized with Agent ID:', elevenLabsAgentId);
}

/**
 * ===============================================================================
 * CONVERSATION MANAGEMENT
 * ===============================================================================
 */

/**
 * Create new conversation session with ElevenLabs
 */
async function createConversation(sessionId, patientQuery) {
  try {
    const conversationSession = {
      sessionId,
      patientQuery,
      patientData: { query: patientQuery },
      isActive: true,
      createdAt: new Date(),
      agentWebSocket: null
    };

    activeConversations.set(sessionId, conversationSession);

    // Establish WebSocket connection to ElevenLabs
    const agentWebSocket = await createElevenLabsWebSocket(sessionId);
    conversationSession.agentWebSocket = agentWebSocket;

    console.log('✅ Conversation created for session:', sessionId);
    return conversationSession;
  } catch (error) {
    console.error('❌ Error creating conversation:', error);
    throw error;
  }
}

/**
 * ===============================================================================
 * WEBSOCKET CONNECTION MANAGEMENT
 * ===============================================================================
 */

/**
 * Create WebSocket connection to ElevenLabs Conversational AI
 */
async function createElevenLabsWebSocket(sessionId) {
  return new Promise((resolve, reject) => {
    const websocketUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${elevenLabsAgentId}`;
    
    console.log('🔗 Connecting to ElevenLabs WebSocket for session:', sessionId);
    
    const agentWebSocket = new WebSocket(websocketUrl, {
      headers: { 'xi-api-key': elevenLabsApiKey }
    });

    agentWebSocket.on('open', () => {
      console.log('✅ ElevenLabs WebSocket connected for session:', sessionId);
      
      // Initialize conversation with user context
      initializeConversation(agentWebSocket, sessionId);
      resolve(agentWebSocket);
    });

    agentWebSocket.on('message', (messageData) => {
      handleElevenLabsMessage(sessionId, messageData);
    });

    agentWebSocket.on('error', (connectionError) => {
      console.error('❌ ElevenLabs WebSocket error:', connectionError);
      reject(connectionError);
    });

    agentWebSocket.on('close', (code, reason) => {
      console.log('🔌 ElevenLabs WebSocket closed for session:', sessionId);
      endConversation(sessionId);
    });
  });
}

/**
 * Initialize conversation with user context and settings
 */
function initializeConversation(agentWebSocket, sessionId) {
  const conversationSession = activeConversations.get(sessionId);
  
  const initializationMessage = {
    type: 'conversation_initiation_metadata',
    conversation_initiation_metadata: {
      user_id: sessionId,
      user_object: {
        name: 'Patient',
        language: 'hindi'
      }
    },
    dynamic_variables: {
      new_variable: conversationSession?.patientQuery || 'general treatment'
    }
  };
  
  console.log('📤 Initializing conversation with context');
  agentWebSocket.send(JSON.stringify(initializationMessage));
}

/**
 * ===============================================================================
 * MESSAGE PROCESSING
 * ===============================================================================
 */

/**
 * Process all incoming messages from ElevenLabs
 */
async function handleElevenLabsMessage(sessionId, messageData) {
  try {
    const parsedMessage = JSON.parse(messageData);
    const conversationSession = activeConversations.get(sessionId);
    
    if (!conversationSession) {
      console.log('⚠️ No conversation found for session:', sessionId);
      return;
    }

    console.log('📋 Processing ElevenLabs message:', parsedMessage.type);

    switch (parsedMessage.type) {
      case 'user_transcript':
        handleUserTranscript(sessionId, parsedMessage);
        break;

      case 'agent_response':
        handleAgentTextResponse(sessionId, parsedMessage);
        break;

      case 'agent_response_audio_delta':
        handleAgentAudioChunk(sessionId, parsedMessage);
        break;

      case 'audio':
        handleDirectAudio(sessionId, parsedMessage);
        break;

      case 'agent_response_audio_end':
        handleAgentAudioEnd(sessionId);
        break;

      case 'conversation_end':
        handleConversationEnd(sessionId);
        break;

      case 'ping':
        handlePing(sessionId, parsedMessage, conversationSession);
        break;

      case 'conversation_initiation_metadata':
        handleConversationReady(sessionId, parsedMessage, conversationSession);
        break;

      default:
        console.log('❓ Unknown message type:', parsedMessage.type);
    }
  } catch (error) {
    console.error('❌ Error handling ElevenLabs message:', error);
  }
}

/**
 * Handle user speech transcript
 */
function handleUserTranscript(sessionId, transcriptMessage) {
  const userTranscript = transcriptMessage.user_transcript_event?.user_transcript || transcriptMessage.user_transcript;
  console.log('👤 User transcript:', userTranscript);
  
  forwardToClient(sessionId, {
    type: 'user_transcript',
    text: userTranscript
  });
}

/**
 * Handle agent text response
 */
function handleAgentTextResponse(sessionId, responseMessage) {
  const agentResponseText = responseMessage.agent_response_event?.agent_response || 
                           responseMessage.agent_response?.text || 
                           responseMessage.text;
  
  console.log('🤖 Agent response:', agentResponseText);
  
  if (agentResponseText) {
    forwardToClient(sessionId, {
      type: 'agent_response',
      text: agentResponseText
    });
  }
}

/**
 * Handle streaming audio chunks from agent
 */
function handleAgentAudioChunk(sessionId, audioMessage) {
  if (audioMessage.agent_response_audio_delta_event?.delta_audio_base_64) {
    console.log('🔊 Agent audio chunk received');
    forwardToClient(sessionId, {
      type: 'agent_audio',
      audio: audioMessage.agent_response_audio_delta_event.delta_audio_base_64
    });
  }
}

/**
 * Handle direct audio messages
 */
function handleDirectAudio(sessionId, directAudioMessage) {
  if (directAudioMessage.audio_event?.audio_base_64) {
    console.log('🔊 Direct audio received');
    forwardToClient(sessionId, {
      type: 'agent_audio',
      audio: directAudioMessage.audio_event.audio_base_64
    });
  }
}

/**
 * Handle agent finished speaking
 */
function handleAgentAudioEnd(sessionId) {
  console.log('✅ Agent finished speaking');
  forwardToClient(sessionId, {
    type: 'agent_audio_end'
  });
}

/**
 * Handle conversation end
 */
function handleConversationEnd(sessionId) {
  console.log('🔚 Conversation ended for session:', sessionId);
  forwardToClient(sessionId, {
    type: 'conversation_ended',
    message: 'Conversation completed successfully'
  });
}

/**
 * Handle ping/pong for connection keepalive
 */
function handlePing(sessionId, pingMessage, conversationSession) {
  console.log('📡 Ping received from ElevenLabs');
  
  if (conversationSession?.agentWebSocket) {
    const pongResponse = {
      pong_event: {
        event_id: pingMessage.ping_event?.event_id
      }
    };
    conversationSession.agentWebSocket.send(JSON.stringify(pongResponse));
  }
}

/**
 * Handle conversation ready state
 */
function handleConversationReady(sessionId, readyMessage, conversationSession) {
  console.log('🎯 Conversation ready for session:', sessionId);
  
  // Store conversation metadata
  if (conversationSession) {
    conversationSession.conversationId = readyMessage.conversation_initiation_metadata_event?.conversation_id;
    conversationSession.audioFormat = readyMessage.conversation_initiation_metadata_event?.agent_output_audio_format;
  }
  
  // Send initial greeting to activate agent
  setTimeout(() => {
    if (conversationSession?.agentWebSocket?.readyState === WebSocket.OPEN) {
      conversationSession.agentWebSocket.send(JSON.stringify({
        user_text: 'Hi'
      }));
      console.log('📤 Sent greeting to activate agent');
    }
  }, 1000);
  
  forwardToClient(sessionId, {
    type: 'agent_ready',
    message: 'Agent is ready to start conversation'
  });
}

/**
 * ===============================================================================
 * AUDIO COMMUNICATION
 * ===============================================================================
 */

/**
 * Send audio chunk to ElevenLabs agent
 */
async function sendAudioToAgent(sessionId, audioData) {
  try {
    const audioMessage = {
      user_audio_chunk: audioData
    };
    
    await sendToElevenLabs(sessionId, audioMessage);
  } catch (error) {
    console.error('❌ Error sending audio to agent:', error);
  }
}

/**
 * Send text message to ElevenLabs agent
 */
async function sendTextToAgent(sessionId, textContent) {
  try {
    const textMessage = {
      user_text: textContent
    };
    
    await sendToElevenLabs(sessionId, textMessage);
  } catch (error) {
    console.error('❌ Error sending text to agent:', error);
  }
}

/**
 * Send message to ElevenLabs WebSocket
 */
async function sendToElevenLabs(sessionId, messageToSend) {
  const conversationSession = activeConversations.get(sessionId);
  if (conversationSession?.agentWebSocket?.readyState === WebSocket.OPEN) {
    conversationSession.agentWebSocket.send(JSON.stringify(messageToSend));
  } else {
    console.log('⚠️ Cannot send to ElevenLabs - WebSocket not ready');
  }
}

/**
 * ===============================================================================
 * CLIENT COMMUNICATION
 * ===============================================================================
 */

/**
 * Forward messages to the calling system
 */
function forwardToClient(sessionId, messageToForward) {
  if (messageForwardingHandler) {
    messageForwardingHandler(sessionId, messageToForward);
  }
}

/**
 * Set handler for messages to be forwarded to calling system
 */
function setClientMessageHandler(messageHandler) {
  messageForwardingHandler = messageHandler;
}

/**
 * ===============================================================================
 * CONVERSATION LIFECYCLE
 * ===============================================================================
 */

/**
 * End conversation and cleanup resources
 */
async function endConversation(sessionId) {
  const conversationSession = activeConversations.get(sessionId);
  if (conversationSession) {
    if (conversationSession.agentWebSocket) {
      conversationSession.agentWebSocket.close();
    }
    conversationSession.isActive = false;
    activeConversations.delete(sessionId);
    console.log('🧹 Conversation ended and cleaned up:', sessionId);
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
    isActive: conversationSession.isActive,
    patientData: conversationSession.patientData,
    createdAt: conversationSession.createdAt
  };
}

// Initialize environment on module load
validateEnvironment();

module.exports = {
  createConversation,
  sendAudioToAgent,
  sendTextToAgent,
  setClientMessageHandler,
  endConversation,
  getConversation,
  getConversationStatus
};