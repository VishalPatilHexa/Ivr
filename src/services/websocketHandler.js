const WebSocket = require("ws");
var base64 = require('base-64');
const fs = require('fs');
const path = require('path');

// Audio file storage
const audioChunks = new Map(); // sessionId -> array of chunks
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
  console.log("🔍 URL Path:", urlPath);
  console.log("🌐 WebSocket Ready State:", websocket.readyState);
  
  // STEP 1: Store connection and setup call session
  activeConnections.set(sessionId, { websocket });
  console.log("💾 Stored connection for session:", sessionId);
  console.log("📊 Total active connections:", activeConnections.size);
  
  let callSession = getCallSession(sessionId);
  if (!callSession) {
    // Create temporary session for external calls (Knowlarity/Gupshup)
    callSession = {
      sessionId: sessionId,
      status: 'external_connection',
      createdAt: new Date(),
      isExternal: true,
      source: 'knowlarity'
    };
    console.log('✅ Temporary session created for external call:', sessionId);
    console.log('📋 Session details:', JSON.stringify(callSession, null, 2));
  } else {
    console.log('🔄 Using existing call session:', sessionId);
    console.log('📋 Existing session details:', JSON.stringify(callSession, null, 2));
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
  let messageCount = 0;
  
  websocket.on('message', async (incomingMessage) => {
  console.log('🔗 Incoming WebSocket message for session:-------------------------------------------------', incomingMessage);

    try {
      messageCount++;
      console.log(`📬 Message #${messageCount} for session ${sessionId}:`, 
                  incomingMessage instanceof Buffer ? `Binary (${incomingMessage.length} bytes)` : 'Text');
      
      // Handle initial metadata from Knowlarity
      if (isFirstMessage) {
        console.log('🎆 Processing first message (metadata) for session:', sessionId);
        handleInitialMetadata(incomingMessage, sessionId);
        isFirstMessage = false;
        return;
      }
      
      // Route audio and control messages
      if (incomingMessage) {
        console.log('🎵 Processing audio data for session:', sessionId);
        await handleIncomingAudio(incomingMessage, sessionId, agentConversation);
      } else {
        console.log('📝 Processing control message for session:', sessionId);
        handleControlMessages(incomingMessage, sessionId, agentConversation);
      }
      
    } catch (error) {
      console.error('❌ Error processing message for session:', sessionId);
      console.error('💥 Error details:', error.message);
      console.error('🔍 Message type:', incomingMessage instanceof Buffer ? 'Binary' : 'Text');
      console.error('🔍 Message preview:', 
                    incomingMessage instanceof Buffer ? 
                      `Buffer(${incomingMessage.length})` : 
                      incomingMessage.toString().substring(0, 100));
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
 * 
 * CRITICAL CONNECTION POINT: This function creates the bridge between:
 * - ElevenLabs Agent Service (processes AI responses)
 * - WebSocket Handler (manages caller connections)
 * 
 * HOW THE CONNECTION WORKS:
 * 1. This function registers a CALLBACK with ElevenLabs agent service
 * 2. The callback gets STORED in elevenLabsAgent.js as 'messageForwardingHandler'
 * 3. When ElevenLabs processes audio/text, it calls forwardToClient()
 * 4. forwardToClient() EXECUTES this callback with the agent's response
 * 5. This callback then sends the response to the caller via Knowlarity WebSocket
 * 
 * FLOW: ElevenLabs → forwardToClient() → THIS CALLBACK → Knowlarity → Caller
 */
function setupAudioStreaming(sessionId) {
  // CALLBACK REGISTRATION: Register this function with ElevenLabs agent service
  // This callback will be called whenever ElevenLabs has a message for this session
  setClientMessageHandler((currentSessionId, agentMessage) => {
    // SESSION FILTERING: Only process messages for this specific call session
    // This prevents cross-talk between multiple concurrent calls
    if (currentSessionId === sessionId) {
      
      // CONNECTION RETRIEVAL: Get the stored Knowlarity WebSocket connection
      // This connection was stored earlier in handleKnowlarityStream()
      const connection = activeConnections.get(sessionId);
      
      // CONNECTION VALIDATION: Ensure WebSocket is still open before sending
      if (connection?.websocket?.readyState === WebSocket.OPEN) {
        
        // OUTGOING AUDIO STREAM: ElevenLabs Agent → Knowlarity → Caller
        // This is the main audio response from AI agent to caller
        if (agentMessage.type === 'agent_audio' && agentMessage.audio) {
          console.log('🔊 Streaming agent audio to caller');
          
          // SAVE AUDIO CHUNK: Store audio chunk for file creation
          saveAudioChunk(sessionId, agentMessage.audio, 'outgoing');
          
          // AUDIO TRANSMISSION: Send audio to caller
          connection.websocket.send(agentMessage.audio);
        }
        
        // RESPONSE TEXT LOGGING: Log agent text responses for monitoring/debugging
        if (agentMessage.type === 'agent_response' && agentMessage.text) {
          console.log('💬 Agent response:', agentMessage.text.substring(0, 100) + '...');
        }
        
        // AUDIO END DETECTION: Log when agent finishes speaking (for turn-taking)
        if (agentMessage.type === 'agent_audio_end') {
          console.log('✅ Agent finished speaking');
        }
      } else {
        // CONNECTION LOST: WebSocket connection is closed or not available
        console.log('⚠️ Cannot send to caller - WebSocket connection lost for session:', sessionId);
      }
    }
    // ELSE: Message is for a different session - ignore (normal with multiple calls)
  });
}

/**
 * Handle initial metadata message from Knowlarity
 * 
 * FIRST MESSAGE PROTOCOL: The first message from Knowlarity is always JSON metadata
 * containing call information, not audio data. This establishes the call context.
 */
function handleInitialMetadata(metadataMessage, sessionId) {
  try {
    // METADATA PARSING: Extract call information from Knowlarity
    const connectionMetadata = JSON.parse(metadataMessage);
    console.log('📋 Received Knowlarity metadata for session:', sessionId);
    console.log('📊 Metadata details:', JSON.stringify(connectionMetadata, null, 2));
    
    // STATUS UPDATE: Mark call as connected and store metadata
    // This updates the call management system with connection details
    handleCallStatusUpdate(sessionId, { 
      status: 'connected',
      knowlarityMetadata: connectionMetadata,
      isExternal: true
    });
  } catch (jsonError) {
    console.error('❌ Failed to parse initial metadata for session:', sessionId);
    console.error('🔍 Raw message:', metadataMessage.toString());
    console.error('💥 Parse error:', jsonError.message);
    
    // Try to continue with minimal metadata
    handleCallStatusUpdate(sessionId, { 
      status: 'connected',
      knowlarityMetadata: { error: 'Failed to parse metadata' },
      isExternal: true
    });
  }
}

/**
 * INCOMING AUDIO STREAM: Handle audio from caller → ElevenLabs Agent
 * 
 * AUDIO FLOW: Caller speaks → Knowlarity → Binary PCM → Base64 → ElevenLabs
 * 
 * This function processes the incoming audio stream from the caller and forwards
 * it to the ElevenLabs agent for processing and response generation.
 */
async function handleIncomingAudio(audioBuffer, sessionId, agentConversation) {
  console.log('🎵 Received audio from caller, size:', audioBuffer.length, 'bytes');
  
  // SAVE INCOMING AUDIO: Store caller's audio chunk
  // saveAudioChunk(sessionId, audioBuffer, 'incoming');
  
  // AUDIO FORMAT CONVERSION: Convert binary PCM audio to base64 format
  // Knowlarity sends raw binary PCM data, ElevenLabs expects base64 encoded audio
  const audioBase64Data = audioBuffer;
  
  // AUDIO FORWARDING: Send caller's audio to ElevenLabs agent for processing
  if (agentConversation) {
    // STREAM TO AGENT: This will trigger AI processing and eventually a response
    // The response will come back through the callback registered in setupAudioStreaming()
    await sendAudioToAgent(sessionId, audioBase64Data);
  } else {
    // AGENT NOT READY: ElevenLabs conversation not initialized yet - drop audio
    console.log('⚠️ ElevenLabs not ready, audio dropped');
  }
}

/**
 * Handle control messages (call events, DTMF)
 * 
 * CONTROL CHANNEL: Processes non-audio messages from Knowlarity
 * These include call lifecycle events and user input (DTMF tones)
 */
function handleControlMessages(controlMessage, sessionId, agentConversation) {
  try {
    // CONTROL MESSAGE PARSING: Extract control commands from Knowlarity
    const controlData = JSON.parse(controlMessage);
    console.log('📋 Control message:', controlData.type);
    
    // CONTROL MESSAGE ROUTING: Handle different types of call events
    switch (controlData.type) {
      case 'call_start':
        // CALL ACTIVATION: Mark call as active (beyond just connected)
        handleCallStatusUpdate(sessionId, { status: 'active' });
        break;
        
      case 'call_end':
        // CALL TERMINATION: Clean up all resources for this call
        handleCallStatusUpdate(sessionId, { status: 'completed' });
        if (agentConversation) {
          // AGENT CLEANUP: End the ElevenLabs conversation and close WebSocket
          endConversation(sessionId);
        }
        break;
        
      case 'dtmf':
        // DTMF TONES: Handle keypad input from caller (could be used for menu navigation)
        console.log('📞 DTMF received:', controlData.digit);
        // TODO: Could forward DTMF to agent for handling menu options
        break;
    }
  } catch (jsonError) {
    // INVALID CONTROL MESSAGE: Not valid JSON, log and continue
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
 * Save audio chunk to file for debugging and playback
 */
function saveAudioChunk(sessionId, audioData, direction) {
  try {
    // Initialize session audio storage
    if (!audioChunks.has(sessionId)) {
      audioChunks.set(sessionId, {
        incoming: [],
        outgoing: [],
        startTime: new Date()
      });
    }
    
    const sessionAudio = audioChunks.get(sessionId);
    
    // Convert audio data to buffer
    let audioBuffer;
    if (direction === 'incoming') {
      // Incoming is already a buffer
      audioBuffer = audioData;
    } else {
      // Outgoing is base64, decode it
      audioBuffer = Buffer.from(audioData, 'base64');
    }
    
    // Store chunk with timestamp
    sessionAudio[direction].push({
      timestamp: Date.now(),
      data: audioBuffer,
      size: audioBuffer.length
    });
    
    console.log(`💾 Saved ${direction} audio chunk: ${audioBuffer.length} bytes (Session: ${sessionId})`);
    
  } catch (error) {
    console.error('❌ Error saving audio chunk:', error.message);
  }
}

/**
 * Convert audio chunks to playable WAV file
 */
function saveSessionAudioToFile(sessionId) {
  try {
    const sessionAudio = audioChunks.get(sessionId);
    if (!sessionAudio) {
      console.log('⚠️ No audio data found for session:', sessionId);
      return;
    }
    
    const audioDir = path.join(__dirname, '../../audio_files');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    // Save incoming audio (caller)
    if (sessionAudio.incoming.length > 0) {
      const incomingFile = path.join(audioDir, `${sessionId}_incoming.pcm`);
      const incomingBuffer = Buffer.concat(sessionAudio.incoming.map(chunk => chunk.data));
      fs.writeFileSync(incomingFile, incomingBuffer);
      console.log(`💾 Saved incoming audio: ${incomingFile} (${incomingBuffer.length} bytes)`);
      
      // Create WAV file for incoming audio
      createWAVFile(incomingFile, `${sessionId}_incoming.wav`);
    }
    
    // Save outgoing audio (agent)
    if (sessionAudio.outgoing.length > 0) {
      const outgoingFile = path.join(audioDir, `${sessionId}_outgoing.pcm`);
      const outgoingBuffer = Buffer.concat(sessionAudio.outgoing.map(chunk => chunk.data));
      fs.writeFileSync(outgoingFile, outgoingBuffer);
      console.log(`💾 Saved outgoing audio: ${outgoingFile} (${outgoingBuffer.length} bytes)`);
      
      // Create WAV file for outgoing audio
      createWAVFile(outgoingFile, `${sessionId}_outgoing.wav`);
    }
    
    // Create session summary
    const summaryFile = path.join(audioDir, `${sessionId}_summary.json`);
    const summary = {
      sessionId,
      startTime: sessionAudio.startTime,
      endTime: new Date(),
      incomingChunks: sessionAudio.incoming.length,
      outgoingChunks: sessionAudio.outgoing.length,
      totalIncomingBytes: sessionAudio.incoming.reduce((sum, chunk) => sum + chunk.size, 0),
      totalOutgoingBytes: sessionAudio.outgoing.reduce((sum, chunk) => sum + chunk.size, 0)
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`📋 Session summary saved: ${summaryFile}`);
    
  } catch (error) {
    console.error('❌ Error saving session audio:', error.message);
  }
}

/**
 * Create WAV file from PCM data
 */
function createWAVFile(pcmFile, wavFileName) {
  try {
    const audioDir = path.dirname(pcmFile);
    const wavFile = path.join(audioDir, wavFileName);
    const pcmData = fs.readFileSync(pcmFile);
    
    // WAV header for 16kHz, 16-bit, mono PCM
    const header = Buffer.alloc(44);
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize;
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    
    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);      // fmt chunk size
    header.writeUInt16LE(1, 20);       // PCM format
    header.writeUInt16LE(1, 22);       // mono
    header.writeUInt32LE(16000, 24);   // sample rate
    header.writeUInt32LE(32000, 28);   // byte rate
    header.writeUInt16LE(2, 32);       // block align
    header.writeUInt16LE(16, 34);      // bits per sample
    
    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    // Combine header and data
    const wavData = Buffer.concat([header, pcmData]);
    fs.writeFileSync(wavFile, wavData);
    
    console.log(`🎵 WAV file created: ${wavFile} (${wavData.length} bytes)`);
    
  } catch (error) {
    console.error('❌ Error creating WAV file:', error.message);
  }
}

/**
 * Cleanup session resources
 */
function cleanupSession(sessionId, agentConversation) {
  console.log('🧹 Cleaning up session:', sessionId);
  
  // Save audio files before cleanup
  if (audioChunks.has(sessionId)) {
    console.log('🎵 Saving session audio files...');
    saveSessionAudioToFile(sessionId);
    audioChunks.delete(sessionId);
  }
  
  // Check if connection exists before cleanup
  const hadConnection = activeConnections.has(sessionId);
  activeConnections.delete(sessionId);
  console.log(`💾 Connection removed: ${hadConnection ? 'Yes' : 'Already gone'}`);  
  console.log(`📊 Remaining connections: ${activeConnections.size}`);
  
  if (agentConversation) {
    console.log('🤖 Ending ElevenLabs conversation...');
    endConversation(sessionId);
  } else {
    console.log('⚠️ No agent conversation to clean up');
  }
  
  // Update status with external flag
  handleCallStatusUpdate(sessionId, { 
    status: 'disconnected',
    isExternal: true,
    reason: 'WebSocket connection closed'
  });
  console.log('✅ Cleanup completed for session:', sessionId);
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
  console.log('🔄 Status update for session:', sessionId, 'Status:', statusUpdate.status);
  
  if (callManagerService) {
    try {
      callManagerService.handleCallStatusUpdate(sessionId, statusUpdate);
      console.log('✅ Status update successful for session:', sessionId);
    } catch (error) {
      console.log('⚠️ Status update failed for session:', sessionId, 'Error:', error.message);
      // For external sessions, this is expected behavior
      if (statusUpdate.isExternal) {
        console.log('ℹ️ This is an external session - status update failure is normal');
      }
    }
  } else {
    console.log('⚠️ No call manager service available for status update:', sessionId);
  }
}

// ===============================================================================
// ELEVENLABS AGENT SERVICE INTEGRATION
// ===============================================================================
// These functions create the bridge between WebSocket handler and ElevenLabs agent

/**
 * CREATE AGENT CONVERSATION: Initialize ElevenLabs conversation for this call
 * This establishes the AI agent session with context about the patient/treatment
 */
function createConversation(sessionId, treatmentType) {
  return elevenLabsAgentService?.createConversation(sessionId, treatmentType) || null;
}

/**
 * CALLBACK REGISTRATION: Register callback function with ElevenLabs agent
 * This is THE CRITICAL CONNECTION POINT - the callback registered here will be
 * executed whenever ElevenLabs has a message (audio/text) to send to the caller
 * 
 * FLOW: setupAudioStreaming() calls this → elevenLabsAgent stores callback →
 *       agent processes audio → agent calls callback → audio sent to caller
 */
function setClientMessageHandler(messageHandler) {
  elevenLabsAgentService?.setClientMessageHandler(messageHandler);
}

/**
 * AUDIO TO AGENT: Send caller's audio to ElevenLabs agent for processing
 * This triggers the AI to analyze speech and generate a response
 */
function sendAudioToAgent(sessionId, audioData) {
  return elevenLabsAgentService?.sendAudioToAgent(sessionId, audioData) || null;
}

/**
 * END AGENT SESSION: Terminate ElevenLabs conversation and cleanup resources
 */
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