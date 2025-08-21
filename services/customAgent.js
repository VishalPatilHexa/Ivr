const axios = require('axios');

/*
 * ===============================================================================
 * CUSTOM VOICE AGENT SERVICE
 * =============================================================================== 
 * 
 * PURPOSE: Manages real-time voice conversations with custom HexaHealth agent
 * Replaces ElevenLabs integration with custom voice processing API
 * 
 * WORKFLOW:
 * 1. Create conversation session (replaces ElevenLabs session creation)
 * 2. Process audio chunks via HTTP API instead of WebSocket
 * 3. Handle bidirectional audio/text communication
 * 4. Process agent responses and forward to calling system
 * 
 * AUDIO FLOW:
 * - INPUT: Receives base64 audio chunks from caller
 * - OUTPUT: Returns agent audio responses back to caller
 * - FORMATS: Handles PCM/base64 audio conversion
 * 
 * ===============================================================================
 */

// Environment configuration
const customAgentApiUrl = process.env.CUSTOM_AGENT_API_URL || 'https://stagapi.hexahealth.com/saksham/v1/voice/process-audio';
const defaultTreatmentType = process.env.DEFAULT_TREATMENT_TYPE || 'surgery';
const defaultSttProvider = process.env.DEFAULT_STT_PROVIDER || 'google';
const defaultTtsProvider = process.env.DEFAULT_TTS_PROVIDER || 'elevenlabs';
const defaultVoiceId = process.env.DEFAULT_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

// Active conversations storage
const activeConversations = new Map();

// CRITICAL CALLBACK STORAGE: This stores the callback function from websocketHandler.js
// When setupAudioStreaming() calls setClientMessageHandler(), the callback gets stored here
// This callback is THE BRIDGE that sends agent responses back to the caller
let messageForwardingHandler = null;

/**
 * Validate required environment variables on startup
 */
function validateEnvironment() {
  if (!customAgentApiUrl) {
    throw new Error('CUSTOM_AGENT_API_URL is required');
  }
  
  console.log('✅ Custom Agent initialized with API URL:', customAgentApiUrl);
}

/**
 * ===============================================================================
 * CONVERSATION MANAGEMENT
 * ===============================================================================
 */

/**
 * Create new conversation session with Custom Agent
 */
async function createConversation(sessionId, patientQuery) {
  try {
    const conversationSession = {
      sessionId,
      patientQuery,
      patientData: { query: patientQuery },
      isActive: true,
      createdAt: new Date(),
      conversationState: 'initial'
    };

    activeConversations.set(sessionId, conversationSession);

    console.log('✅ Custom Agent conversation created for session:', sessionId);
    
    // Send agent ready notification
    setTimeout(() => {
      forwardToClient(sessionId, {
        type: 'agent_ready',
        message: 'Custom agent is ready to start conversation'
      });
    }, 1000);

    return conversationSession;
  } catch (error) {
    console.error('❌ Error creating custom agent conversation:', error);
    throw error;
  }
}

/**
 * ===============================================================================
 * AUDIO COMMUNICATION
 * ===============================================================================
 */

/**
 * Send audio chunk to Custom Agent API
 * 
 * INCOMING AUDIO PROCESSING: Sends caller's audio to Custom Agent for AI processing
 * 
 * AUDIO FLOW: Caller → Knowlarity → WebSocket → THIS FUNCTION → Custom Agent API
 * The agent processes this audio and generates responses that get sent back via callbacks
 */
async function sendAudioToAgent(sessionId, audioData) {
  try {
    const conversationSession = activeConversations.get(sessionId);
    if (!conversationSession) {
      console.log('⚠️ No conversation found for session:', sessionId);
      return;
    }

    console.log(`🎵 Sending audio to Custom Agent - Session: ${sessionId}, Data size: ${audioData.length} chars`);
    
    // Prepare the payload for custom agent API
    const payload = {
      callerId: sessionId,
      sessionId: sessionId,
      audioBuffer: audioData, // Base64 encoded audio from caller
      treatmentType: conversationSession.patientQuery || defaultTreatmentType,
      sttProvider: defaultSttProvider,
      ttsProvider: defaultTtsProvider,
      voiceId: defaultVoiceId
    };

    console.log('📤 Sending request to Custom Agent API');
    console.log('🔍 Payload:', {
      callerId: payload.callerId,
      sessionId: payload.sessionId,
      audioBufferLength: payload.audioBuffer.length,
      treatmentType: payload.treatmentType,
      sttProvider: payload.sttProvider,
      ttsProvider: payload.ttsProvider,
      voiceId: payload.voiceId
    });

    // Make HTTP request to custom agent API
    const response = await axios.post(customAgentApiUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('✅ Custom Agent API response received');
    console.log('📊 Response status:', response.status);
    console.log('🔍 Response type:', response.data.type);

    // Handle the API response
    await handleCustomAgentResponse(sessionId, response.data);

  } catch (error) {
    console.error('❌ Error sending audio to custom agent:', error.message);
    
    // Send error feedback to client
    forwardToClient(sessionId, {
      type: 'agent_error',
      message: 'Failed to process audio with custom agent'
    });

    // Log detailed error information
    if (error.response) {
      console.error('📊 Error response status:', error.response.status);
      console.error('📋 Error response data:', error.response.data);
    } else if (error.request) {
      console.error('📡 No response received from custom agent API');
    }
  }
}

/**
 * Handle response from Custom Agent API
 */
async function handleCustomAgentResponse(sessionId, responseData) {
  try {
    const conversationSession = activeConversations.get(sessionId);
    if (!conversationSession) {
      console.log('⚠️ No conversation found for session:', sessionId);
      return;
    }

    console.log('📋 Processing Custom Agent response:', responseData.type);

    if (responseData.type === 'playAudio' && responseData.data) {
      // Update conversation state if provided
      if (responseData.conversationState) {
        conversationSession.conversationState = responseData.conversationState;
        console.log('🔄 Conversation state updated to:', responseData.conversationState);
      }

      // Update detected language if provided
      if (responseData.detectedLanguage) {
        conversationSession.detectedLanguage = responseData.detectedLanguage;
        console.log('🌐 Detected language:', responseData.detectedLanguage);
      }

      // Forward audio response to client
      if (responseData.data.audioContent) {
        console.log('🔊 Forwarding agent audio response');
        forwardToClient(sessionId, {
          type: 'agent_audio',
          audio: responseData.data.audioContent
        });

        // Send audio end signal after a brief delay
        setTimeout(() => {
          forwardToClient(sessionId, {
            type: 'agent_audio_end'
          });
        }, 100);
      }
    } else if (responseData.success === false) {
      // Handle error responses
      console.error('❌ Custom Agent API returned error:', responseData.message);
      forwardToClient(sessionId, {
        type: 'agent_error',
        message: responseData.message || 'Custom agent processing failed'
      });
    } else {
      console.log('❓ Unknown Custom Agent response type:', responseData.type || 'undefined');
    }

  } catch (error) {
    console.error('❌ Error handling custom agent response:', error);
    forwardToClient(sessionId, {
      type: 'agent_error',
      message: 'Failed to process custom agent response'
    });
  }
}

/**
 * Send text message to Custom Agent (placeholder for future implementation)
 */
async function sendTextToAgent(sessionId, textContent) {
  console.log('📝 Text message to custom agent (not implemented):', textContent);
  // Custom agent API currently only supports audio input
  // This could be extended in the future for text-based interactions
}

/**
 * ===============================================================================
 * CLIENT COMMUNICATION
 * ===============================================================================
 */

/**
 * Forward messages to the calling system
 * 
 * CRITICAL BRIDGE FUNCTION: This is THE CONNECTION POINT between Custom Agent and WebSocket
 * 
 * HOW THE BRIDGE WORKS:
 * 1. Custom Agent API processes audio/text and calls this function
 * 2. This function executes the callback stored in 'messageForwardingHandler'
 * 3. The callback (from setupAudioStreaming) sends the message to Knowlarity WebSocket
 * 4. Knowlarity forwards it to the caller
 * 
 * FLOW: Custom Agent → THIS FUNCTION → CALLBACK → WebSocket → Knowlarity → Caller
 */
function forwardToClient(sessionId, messageToForward) {
  // CALLBACK EXECUTION: Execute the callback registered by websocketHandler
  if (messageForwardingHandler) {
    // THIS IS THE BRIDGE: Calls the callback from setupAudioStreaming()
    // The callback will send the message to the caller via Knowlarity WebSocket
    messageForwardingHandler(sessionId, messageToForward);
  } else {
    // NO CALLBACK: WebSocket handler hasn't registered a callback yet
    console.log('⚠️ No message handler registered - message dropped:', messageToForward.type);
  }
}

/**
 * Set handler for messages to be forwarded to calling system
 * 
 * CALLBACK REGISTRATION POINT: This is where the WebSocket handler registers its callback
 * 
 * REGISTRATION FLOW:
 * 1. websocketHandler.js calls setupAudioStreaming()
 * 2. setupAudioStreaming() calls THIS FUNCTION with a callback
 * 3. The callback gets STORED in 'messageForwardingHandler'
 * 4. Later, when Custom Agent has responses, forwardToClient() EXECUTES this callback
 * 
 * This creates the communication bridge: Custom Agent → WebSocket → Caller
 */
function setClientMessageHandler(messageHandler) {
  // CALLBACK STORAGE: Store the callback from websocketHandler for later execution
  messageForwardingHandler = messageHandler;
  console.log('✅ Custom Agent message forwarding handler registered - bridge established');
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
    conversationSession.isActive = false;
    activeConversations.delete(sessionId);
    console.log('🧹 Custom Agent conversation ended and cleaned up:', sessionId);
    
    // Notify client of conversation end
    forwardToClient(sessionId, {
      type: 'conversation_ended',
      message: 'Custom agent conversation completed successfully'
    });
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
    conversationState: conversationSession.conversationState,
    detectedLanguage: conversationSession.detectedLanguage,
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