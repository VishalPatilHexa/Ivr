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

// CRITICAL CALLBACK STORAGE: This stores the callback function from websocketHandler.js
// When setupAudioStreaming() calls setClientMessageHandler(), the callback gets stored here
// This callback is THE BRIDGE that sends agent responses back to the caller
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
    const agentWebSocket = await createElevenLabsWebSocket(sessionId, elevenLabsAgentId);
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
async function createElevenLabsWebSocket(sessionId, elevenLabsAgentId) {
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
      try {
        console.log(`📨 Raw ElevenLabs message received: ${messageData.length} bytes for session: ${sessionId}`);
        handleElevenLabsMessage(sessionId, messageData);
      } catch (error) {
        console.error(`❌ ERROR in WebSocket message handler for session ${sessionId}:`, error.message);
        console.error(`🔍 Stack trace:`, error.stack);
      }
    });

    agentWebSocket.on('error', (connectionError) => {
      console.error('❌ ElevenLabs WebSocket error:', connectionError);
      reject(connectionError);
    });

    agentWebSocket.on('close', (code, reason) => {
      console.error(`🔌 CRITICAL: ElevenLabs WebSocket CLOSED for session: ${sessionId}`);
      console.error(`🔍 Close code: ${code} Reason: ${reason ? reason.toString() : 'No reason provided'}`);
      console.error(`🔍 Active conversations before cleanup: ${activeConversations.size}`);
      endConversation(sessionId);
      console.error(`🔍 Active conversations after cleanup: ${activeConversations.size}`);
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
    dynamic_variables: {
      user_name: 'Patient',
      language: 'hindi',
      user_id: sessionId,
      treatmentType: conversationSession?.patientQuery || 'general consultation'
    },
    // Optional: Add conversation config overrides
    conversation_config_override: {
      agent: {
        language: 'hi'  // Set agent language to Hindi
      }
    }
  };
  
  console.log('📤 Initializing conversation with correct client data structure');
  console.log('🔍 Initialization message:', JSON.stringify(initializationMessage, null, 2));
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
        //calling this function for each audio chunk
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
 * 
 * SPEECH-TO-TEXT: Processes transcription of caller's speech from ElevenLabs
 * This shows what the caller said (useful for monitoring/logging)
 */
function handleUserTranscript(sessionId, transcriptMessage) {
  // EXTRACT TRANSCRIPT: Get the transcribed text of what the caller said
  const userTranscript = transcriptMessage.user_transcript_event?.user_transcript || transcriptMessage.user_transcript;
  console.log('👤 User transcript:', userTranscript);
  
  // TRANSCRIPT FORWARDING: Send transcript to websocketHandler for monitoring
  // This is mainly for logging - the actual audio processing happens separately
  forwardToClient(sessionId, {
    type: 'user_transcript',
    text: userTranscript
  });
}

/**
 * Handle agent text response
 * 
 * TEXT PROCESSING: Handles text responses from ElevenLabs agent
 * This provides the transcript of what the agent is saying
 */
function handleAgentTextResponse(sessionId, responseMessage) {
  // EXTRACT TEXT: Get agent's text response from various possible message formats
  const agentResponseText = responseMessage.agent_response_event?.agent_response || 
                           responseMessage.agent_response?.text || 
                           responseMessage.text;
  
  console.log('🤖 Agent response:', agentResponseText);
  
  if (agentResponseText) {
    // TEXT FORWARDING: Send text to websocketHandler (mainly for logging/monitoring)
    // The callback will log this text but the audio is what actually plays to caller
    forwardToClient(sessionId, {
      type: 'agent_response',
      text: agentResponseText
    });
  }
}

/**
 * Handle streaming audio chunks from agent
 * 
 * AUDIO STREAMING: Processes audio response chunks from ElevenLabs agent
 * This is called for each audio chunk as the agent speaks (streaming response)
 */
function handleAgentAudioChunk(sessionId, audioMessage) {
  if (audioMessage.agent_response_audio_delta_event?.delta_audio_base_64) {
    const audioData = audioMessage.agent_response_audio_delta_event.delta_audio_base_64;
    console.log('🔊 Agent audio chunk received - Size:', audioData.length, 'chars');
    console.log('🔍 Audio chunk preview:', audioData.substring(0, 50) + '...');
    
    // AUDIO FORWARDING: Send audio chunk to caller via the registered callback
    // This triggers the callback in setupAudioStreaming() which sends audio to Knowlarity
    forwardToClient(sessionId, {
      type: 'agent_audio',
      audio: audioData
    });
    
    console.log('✅ Audio chunk forwarded to callback handler');
  } else {
    console.log('⚠️ Agent audio chunk missing delta_audio_base_64 field');
    console.log('🔍 Available fields:', Object.keys(audioMessage.agent_response_audio_delta_event || {}));
  }
}

/**
 * Handle direct audio messages
 */
function handleDirectAudio(sessionId, directAudioMessage) {
  if (directAudioMessage.audio_event?.audio_base_64) {
    const audioData = directAudioMessage.audio_event.audio_base_64;
    console.log('🔊 Direct audio received - Size:', audioData.length, 'chars');
    console.log('🔍 Direct audio preview:', audioData.substring(0, 50) + '...');
    
    forwardToClient(sessionId, {
      type: 'agent_audio',
      audio: audioData
    });
    
    console.log('✅ Direct audio forwarded to callback handler');
  } else {
    console.log('⚠️ Direct audio message missing audio_base_64 field');
    console.log('🔍 Available fields:', Object.keys(directAudioMessage.audio_event || {}));
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
      // CRITICAL FIX: Don't send immediate text greeting to prevent premature activation
      // Let the caller speak first for a more natural conversation flow
      console.log('🎯 Agent ready - waiting for caller audio input');
      
      // Optional: Send a minimal prompt to prepare the agent but don't force speech
      // conversationSession.agentWebSocket.send(JSON.stringify({
      //   user_text: 'Hi'
      // }));
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
 * 
 * INCOMING AUDIO PROCESSING: Sends caller's audio to ElevenLabs for AI processing
 * 
 * AUDIO FLOW: Caller → Knowlarity → WebSocket → THIS FUNCTION → ElevenLabs Agent
 * The agent processes this audio and generates responses that get sent back via callbacks
 */
async function sendAudioToAgent(sessionId, audioData) {
  try {
    // AUDIO MESSAGE FORMATTING: Package audio for ElevenLabs API
    const audioMessage = {
      user_audio_chunk: audioData  // Base64 encoded audio from caller
    };
    
    console.log(`🎵 Sending audio to ElevenLabs - Session: ${sessionId}, Data size: ${audioData.length} chars`);
    console.log('🔍 Audio preview:', audioData.substring(0, 50) + '...');
    
    // SEND TO AGENT: Forward caller's audio to ElevenLabs for processing
    // This will trigger AI processing and eventually generate response audio
    await sendToElevenLabs(sessionId, audioMessage);
    console.log('✅ Audio message sent to ElevenLabs WebSocket');
  } catch (error) {
    console.error('❌ Error sending audio to agent:', error);
    console.error('🔍 Error details:', error.message);
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
 * 
 * AGENT COMMUNICATION: Low-level function to send messages to ElevenLabs API
 * Used for sending audio chunks, text, and control messages to the AI agent
 */
async function sendToElevenLabs(sessionId, messageToSend) {
  // GET CONVERSATION: Retrieve the stored conversation session
  const conversationSession = activeConversations.get(sessionId);
  
  // WEBSOCKET VALIDATION: Ensure connection to ElevenLabs is still active
  if (conversationSession?.agentWebSocket?.readyState === WebSocket.OPEN) {
    // SEND MESSAGE: Forward message to ElevenLabs agent via WebSocket
    conversationSession.agentWebSocket.send(JSON.stringify(messageToSend));
  } else {
    // CONNECTION LOST: ElevenLabs WebSocket is not available
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
 * 
 * CRITICAL BRIDGE FUNCTION: This is THE CONNECTION POINT between ElevenLabs and WebSocket
 * 
 * HOW THE BRIDGE WORKS:
 * 1. ElevenLabs agent processes audio/text and calls this function
 * 2. This function executes the callback stored in 'messageForwardingHandler'
 * 3. The callback (from setupAudioStreaming) sends the message to Knowlarity WebSocket
 * 4. Knowlarity forwards it to the caller
 * 
 * FLOW: ElevenLabs → THIS FUNCTION → CALLBACK → WebSocket → Knowlarity → Caller
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
 * 4. Later, when ElevenLabs has responses, forwardToClient() EXECUTES this callback
 * 
 * This creates the communication bridge: ElevenLabs → WebSocket → Caller
 */
function setClientMessageHandler(messageHandler) {
  // CALLBACK STORAGE: Store the callback from websocketHandler for later execution
  messageForwardingHandler = messageHandler;
  console.log('✅ Message forwarding handler registered - bridge established');
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