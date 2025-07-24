const WebSocket = require("ws");

/*
 * ===============================================================================
 * KNOWLARITY-ELEVENLABS WEBSOCKET HANDLER
 * =============================================================================== 
 * 
 * CALLING WORKFLOW:
 * 1. Knowlarity initiates WebSocket connection to /knowlarity-stream/{sessionId}
 * 2. System creates/retrieves call session and initializes ElevenLabs agent
 * 3. Audio streaming begins bidirectionally between caller and AI agent
 * 
 * STREAMING WORKFLOW:
 * 1. INCOMING AUDIO: Caller → Knowlarity → WebSocket → ElevenLabs Agent
 * 2. OUTGOING AUDIO: ElevenLabs Agent → WebSocket → Knowlarity → Caller
 * 3. CONTROL MESSAGES: Handle call start/end, DTMF, and connection management
 * 
 * ===============================================================================
 */

// Active WebSocket connections storage
const activeConnections = new Map();

// Service dependencies
let elevenLabsAgentService = null;
let callManagerService = null;

/**
 * Initialize WebSocket handler with required service dependencies
 */
function initializeWebSocketHandler(elevenLabsAgentInstance, outboundCallManagerInstance) {
  elevenLabsAgentService = elevenLabsAgentInstance;
  callManagerService = outboundCallManagerInstance;
}

/**
 * Main WebSocket connection handler - routes connections based on URL path
 */
function handleConnection(websocket, request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const urlPath = url.pathname;
  
  // Route to Knowlarity stream handler
  if (urlPath.startsWith('/knowlarity-stream/')) {
    handleKnowlarityStream(websocket, urlPath);
    return;
  }
  
  // Reject unknown connection types
  console.log("🔗 Unknown WebSocket connection, closing");
  websocket.close(1008, 'Unknown connection type');
}

/**
 * ===============================================================================
 * MAIN KNOWLARITY STREAM HANDLER
 * ===============================================================================
 * Handles the complete audio streaming workflow between Knowlarity and ElevenLabs
 */
function handleKnowlarityStream(websocket, urlPath) {
  const sessionId = urlPath.split('/')[2];
  console.log("📞 New Knowlarity call stream connection for session:", sessionId);
  
  // STEP 1: Store connection and setup call session
  activeConnections.set(sessionId, { websocket });
  
  let callSession = getCallSession(sessionId);
  if (!callSession) {
    // Create temporary session for external calls Knowlarity
    callSession = {
      sessionId: sessionId,
      status: 'external_connection',
      createdAt: new Date(),
      isExternal: true
    };
    console.log('✅ Temporary session created for external call:', sessionId);
  }
  
  // STEP 2: Initialize ElevenLabs conversation
  let agentConversation = null;
  
  const initializeAgentConversation = async () => {
    try {
      console.log('🤖 Initializing ElevenLabs conversation for session:', sessionId);
      
      agentConversation = await createConversation(
        sessionId,
        callSession.patientData?.treatmentType || 'general consultation'
      );
      
      // STEP 3: Setup bidirectional audio streaming
      setupAudioStreaming(sessionId);
      
    } catch (error) {
      console.error('❌ Error creating ElevenLabs conversation:', error);
      websocket.close(1011, 'Failed to initialize conversation');
    }
  };
  
  // STEP 4: Setup message handling for audio streaming
  let isFirstMessage = true;
  
  websocket.on('message', async (incomingMessage) => {
    try {
      // Handle initial metadata from Knowlarity
      if (isFirstMessage) {
        handleInitialMetadata(incomingMessage, sessionId);
        isFirstMessage = false;
        return;
      }
      
      // Route audio and control messages
      if (incomingMessage instanceof Buffer) {
        await handleIncomingAudio(incomingMessage, sessionId, agentConversation);
      } else {
        handleControlMessages(incomingMessage, sessionId, agentConversation);
      }
      
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
  });
  
  // STEP 5: Setup connection lifecycle handlers
  setupConnectionLifecycle(websocket, sessionId, agentConversation);
  
  // Initialize the conversation
  initializeAgentConversation();
}

/**
 * ===============================================================================
 * AUDIO STREAMING FUNCTIONS
 * ===============================================================================
 */

/**
 * Setup bidirectional audio streaming between ElevenLabs and Knowlarity
 */
function setupAudioStreaming(sessionId) {
  setClientMessageHandler((currentSessionId, agentMessage) => {
    if (currentSessionId === sessionId) {
      const connection = activeConnections.get(sessionId);
      if (connection?.websocket?.readyState === WebSocket.OPEN) {
        
        // OUTGOING AUDIO: ElevenLabs → Knowlarity → Caller
        if (agentMessage.type === 'agent_audio' && agentMessage.audio) {
          const audioPlaybackCommand = {
            type: 'playAudio',
            data: {
              audioContentType: 'raw',  
              sampleRate: 16000,
              audioContent: agentMessage.audio
            }
          };
          
          console.log('🔊 Streaming agent audio to caller');
          connection.websocket.send(JSON.stringify(audioPlaybackCommand));
        }
        
        // Log agent responses for monitoring
        if (agentMessage.type === 'agent_response' && agentMessage.text) {
          console.log('💬 Agent response:', agentMessage.text.substring(0, 100) + '...');
        }
        
        if (agentMessage.type === 'agent_audio_end') {
          console.log('✅ Agent finished speaking');
        }
      }
    }
  });
}

/**
 * Handle initial metadata message from Knowlarity
 */
function handleInitialMetadata(metadataMessage, sessionId) {
  const connectionMetadata = JSON.parse(metadataMessage);
  console.log('📋 Received Knowlarity metadata for session:', sessionId);
  
  handleCallStatusUpdate(sessionId, { 
    status: 'connected',
    knowlarityMetadata: connectionMetadata
  });
}

/**
 * INCOMING AUDIO: Handle audio from caller → ElevenLabs
 */
async function handleIncomingAudio(audioBuffer, sessionId, agentConversation) {
  console.log('🎵 Received audio from caller, size:', audioBuffer.length, 'bytes');
  
  // Convert PCM audio to base64 for ElevenLabs
  const audioBase64Data = audioBuffer.toString('base64');
  
  // Stream to ElevenLabs agent
  if (agentConversation) {
    await sendAudioToAgent(sessionId, audioBase64Data);
  } else {
    console.log('⚠️ ElevenLabs not ready, audio dropped');
  }
}

/**
 * Handle control messages (call events, DTMF)
 */
function handleControlMessages(controlMessage, sessionId, agentConversation) {
  try {
    const controlData = JSON.parse(controlMessage);
    console.log('📋 Control message:', controlData.type);
    
    switch (controlData.type) {
      case 'call_start':
        handleCallStatusUpdate(sessionId, { status: 'active' });
        break;
        
      case 'call_end':
        handleCallStatusUpdate(sessionId, { status: 'completed' });
        if (agentConversation) {
          endConversation(sessionId);
        }
        break;
        
      case 'dtmf':
        console.log('📞 DTMF received:', controlData.digit);
        break;
    }
  } catch (jsonError) {
    console.log('⚠️ Non-JSON control message received');
  }
}

/**
 * ===============================================================================
 * CONNECTION LIFECYCLE MANAGEMENT
 * ===============================================================================
 */

/**
 * Setup WebSocket connection lifecycle handlers
 */
function setupConnectionLifecycle(websocket, sessionId, agentConversation) {
  // Handle connection close
  websocket.on('close', () => {
    console.log('📞 Call stream closed for session:', sessionId);
    cleanupSession(sessionId, agentConversation);
  });
  
  // Handle connection errors  
  websocket.on('error', (connectionError) => {
    console.error('❌ WebSocket error:', connectionError);
    cleanupSession(sessionId, agentConversation);
    handleCallStatusUpdate(sessionId, { status: 'failed', reason: connectionError.message });
  });
}

/**
 * Cleanup session resources
 */
function cleanupSession(sessionId, agentConversation) {
  console.log('🧹 Cleaning up session:', sessionId);
  
  activeConnections.delete(sessionId);
  
  if (agentConversation) {
    endConversation(sessionId);
  }
  
  handleCallStatusUpdate(sessionId, { status: 'disconnected' });
  console.log('✅ Cleanup completed');
}

/**
 * ===============================================================================
 * CALL CONTROL FUNCTIONS
 * ===============================================================================
 */

/**
 * Transfer call to another number
 */
function transferCall(sessionId, targetPhoneNumber) {
  const connection = activeConnections.get(sessionId);
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    connection.websocket.send(JSON.stringify({
      type: 'transfer',
      data: { textContent: targetPhoneNumber }
    }));
    console.log(`📞 Transferring call ${sessionId} to ${targetPhoneNumber}`);
  } else {
    console.error(`❌ Cannot transfer call ${sessionId} - connection not found`);
  }
}

/**
 * Terminate call stream
 */
function terminateStream(sessionId) {
  const connection = activeConnections.get(sessionId);
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    connection.websocket.send(JSON.stringify({ type: 'disconnect' }));
    console.log(`📞 Terminating stream for call ${sessionId}`);
  } else {
    console.error(`❌ Cannot terminate stream ${sessionId} - connection not found`);
  }
}

/**
 * Stop audio playback
 */
function killAudio(sessionId) {
  const connection = activeConnections.get(sessionId);
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    connection.websocket.send(JSON.stringify({ type: 'killAudio' }));
    console.log(`📞 Killing audio for call ${sessionId}`);
  } else {
    console.error(`❌ Cannot kill audio ${sessionId} - connection not found`);
  }
}

/**
 * ===============================================================================
 * SYSTEM MANAGEMENT
 * ===============================================================================
 */

/**
 * Cleanup dead connections
 */
function cleanup() {
  activeConnections.forEach((connection, sessionId) => {
    if (connection.websocket?.readyState === WebSocket.CLOSED) {
      cleanupSession(sessionId, null);
    }
  });
}

/**
 * Shutdown all connections
 */
function shutdown() {
  activeConnections.forEach((connection, sessionId) => {
    if (connection.websocket?.readyState === WebSocket.OPEN) {
      connection.websocket.close();
    }
    endConversation(sessionId);
  });
}

/**
 * ===============================================================================
 * SERVICE INTEGRATION FUNCTIONS
 * ===============================================================================
 */

// Get call session from outbound call manager
function getCallSession(sessionId) {
  return callManagerService?.getCallSession(sessionId) || null;
}

// Update call status
function handleCallStatusUpdate(sessionId, statusUpdate) {
  if (callManagerService) {
    try {
      callManagerService.handleCallStatusUpdate(sessionId, statusUpdate);
    } catch (error) {
      console.log('⚠️ Status update failed for external session:', sessionId);
    }
  }
}

// ElevenLabs integration functions
function createConversation(sessionId, treatmentType) {
  return elevenLabsAgentService?.createConversation(sessionId, treatmentType) || null;
}

function setClientMessageHandler(messageHandler) {
  elevenLabsAgentService?.setClientMessageHandler(messageHandler);
}

function sendAudioToAgent(sessionId, audioData) {
  return elevenLabsAgentService?.sendAudioToAgent(sessionId, audioData) || null;
}

function endConversation(sessionId) {
  return elevenLabsAgentService?.endConversation(sessionId) || null;
}

module.exports = {
  initializeWebSocketHandler,
  handleConnection,
  transferCall,
  terminateStream,
  killAudio,
  cleanup,
  shutdown
};