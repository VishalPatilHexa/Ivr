const { addConnection, getConnection, removeConnection } = require('./connectionManager');
const { processInitialMetadata } = require('../metadata/metadataHandler');
const { processIncomingAudio } = require('../audio/audioProcessor');
const { sendAudioToCaller, handleControlMessage } = require('../../integrations/knowlarity/messageHandler');
const { createConversation, sendAudioToAgent, endConversation, setClientMessageHandler } = require('../../integrations/elevenlabs/agentService');
const config = require('../../config');

/**
 * Handle Knowlarity stream connection
 */
async function handleKnowlarityStream(websocket, urlPath) {
  console.log(`🔍 URL path received: ${urlPath}`);
  console.log(`🔍 URL path parts:`, urlPath.split("/"));
  
  const sessionId = urlPath.split("/")[2];
  console.log(`📞 Extracted session ID: ${sessionId}`);

  // Validate session ID
  if (!sessionId || sessionId.trim() === '') {
    console.error(`❌ Invalid session ID extracted from URL: ${urlPath}`);
    websocket.close(1008, "Invalid session ID");
    return;
  }

  console.log(`📞 New Knowlarity stream connection for session: ${sessionId}`);

  // Setup message handling IMMEDIATELY - metadata arrives right after sessionId extraction
  let isFirstMessage = true;
  console.log(`⚡ Setting up message handler immediately for session: ${sessionId}`);

  websocket.on("message", async (incomingMessage) => {
    try {
      console.log(`📨 Message received for session: ${sessionId}`);
      console.log(`📊 Message type: ${incomingMessage instanceof Buffer ? 'Buffer' : typeof incomingMessage}`);
      console.log(`📏 Message length: ${incomingMessage.length}`);
      console.log(`🔤 First 20 bytes as string:`, incomingMessage.toString().substring(0, 20));
      console.log(`🔢 First 10 bytes as numbers:`, Array.from(incomingMessage.slice(0, 10)));
      
      // Handle first message - could be metadata or audio
      if (isFirstMessage) {
        console.log(`🎆 *** THIS IS THE FIRST MESSAGE *** for session: ${sessionId}`);
        
        // Check if first message is JSON metadata or binary audio
        if (await tryProcessAsMetadata(incomingMessage, sessionId)) {
          console.log(`📋 First message was metadata for session: ${sessionId}`);
          isFirstMessage = false;
          return;
        } else {
          console.log(`🎵 First message is audio data for session: ${sessionId}`);
          // Continue to process as audio below
          isFirstMessage = false;
        }
      } else {
        console.log(`📨 Subsequent message for session: ${sessionId}`);
      }

      // Route audio and control messages
      await routeIncomingMessage(incomingMessage, sessionId);

    } catch (error) {
      console.error(`❌ Error processing message for session ${sessionId}:`, error.message);
    }
  });

  // Setup connection lifecycle handlers
  websocket.on("close", () => {
    console.log(`📞 Call stream closed for session: ${sessionId}`);
    cleanupSession(sessionId);
  });

  websocket.on("error", (error) => {
    console.error(`❌ WebSocket error for session ${sessionId}:`, error.message);
    cleanupSession(sessionId);
  });

  // Store connection after message handler is set up
  addConnection(sessionId, {
    websocket,
    clientType: 'knowlarity',
    agentConversation: null
  });

  // Initialize ElevenLabs conversation
  try {
    await initializeAgentConversation(sessionId);
  } catch (error) {
    console.error('❌ Failed to initialize agent conversation:', error.message);
    websocket.close(1011, "Failed to initialize conversation");
    return;
  }
}

/**
 * Initialize ElevenLabs conversation
 */
async function initializeAgentConversation(sessionId) {
  console.log(`🤖 Initializing ElevenLabs conversation for session: ${sessionId}`);

  const agentConversation = await createConversation(sessionId, config.session.defaultTreatmentType);

  // Update connection with agent conversation
  const connection = getConnection(sessionId);
  if (connection) {
    connection.agentConversation = agentConversation;
    console.log(`💾 Agent conversation stored for session: ${sessionId}`);
  }

  // Setup bidirectional audio streaming
  setupAudioStreaming(sessionId);

  // Notify client that agent is ready
  if (connection?.websocket?.readyState === 1) {
    connection.websocket.send(JSON.stringify({
      type: "agent_ready",
      message: "ElevenLabs agent is ready for conversation"
    }));
    console.log("📤 Sent agent_ready notification to client");
  }
}

/**
 * Setup bidirectional audio streaming
 */
function setupAudioStreaming(sessionId) {
  setClientMessageHandler((currentSessionId, agentMessage) => {
    if (currentSessionId === sessionId) {
      const connection = getConnection(sessionId);

      if (connection?.websocket?.readyState === 1) {
        // Handle agent audio
        if (agentMessage.type === "agent_audio" && agentMessage.audio) {
          console.log('🔊 Streaming agent audio to caller');
          sendAudioToCaller(sessionId, agentMessage.audio);
        }

        // Handle agent response text
        if (agentMessage.type === "agent_response" && agentMessage.text) {
          console.log(`💬 Agent response: ${agentMessage.text.substring(0, 100)}...`);
        }

        // Handle audio end
        if (agentMessage.type === "agent_audio_end") {
          console.log("✅ Agent finished speaking");
        }
      } else {
        console.log(`⚠️ Cannot send to caller - WebSocket connection lost for session: ${sessionId}`);
      }
    }
  });
}

/**
 * Try to process message as metadata, return true if successful
 */
async function tryProcessAsMetadata(incomingMessage, sessionId) {
  try {
    const messageStr = incomingMessage.toString();
    
    // Quick check - if it starts with '{' or contains common metadata fields, try as JSON
    if (messageStr.startsWith('{') || messageStr.includes('callid') || messageStr.includes('virtual_number')) {
      console.log(`🔍 Message looks like JSON metadata for session: ${sessionId}`);
      await processInitialMetadata(incomingMessage, sessionId);
      return true;
    }
    
    // If it doesn't look like JSON, treat as binary audio
    console.log(`🎵 Message doesn't look like JSON metadata, treating as audio for session: ${sessionId}`);
    return false;
    
  } catch (error) {
    console.log(`⚠️ Failed to process as metadata, treating as audio for session: ${sessionId} - ${error.message}`);
    return false;
  }
}

/**
 * Route incoming messages (audio or control)
 */
async function routeIncomingMessage(incomingMessage, sessionId) {
  if (incomingMessage instanceof Buffer) {
    // Try to parse as JSON first (for control messages)
    try {
      const messageStr = incomingMessage.toString();
      const parsedMessage = JSON.parse(messageStr);

      if (parsedMessage.type === "audio-chunk" && parsedMessage.audio) {
        // Handle JSON audio chunk
        console.log(`🎵 Processing JSON audio chunk for session: ${sessionId}`);
        const audioBuffer = Buffer.from(parsedMessage.audio, "base64");
        await handleIncomingAudio(audioBuffer, sessionId);
      } else {
        // Handle control message
        console.log(`📝 Processing control message for session: ${sessionId}`);
        handleControlMessage(messageStr, sessionId);
      }
    } catch (parseError) {
      // Not JSON, treat as binary audio
      console.log(`🎵 Processing binary audio data for session: ${sessionId}`);
      await handleIncomingAudio(incomingMessage, sessionId);
    }
  } else {
    // Handle text control messages
    console.log(`📝 Processing text control message for session: ${sessionId}`);
    handleControlMessage(incomingMessage.toString(), sessionId);
  }
}

/**
 * Handle incoming audio from caller
 */
async function handleIncomingAudio(audioBuffer, sessionId) {
  console.log(`🎵 Received audio from caller: ${audioBuffer.length} bytes`);

  // Process audio
  const audioResult = await processIncomingAudio(audioBuffer, sessionId);
  
  if (!audioResult.success) {
    console.error(`❌ Audio processing failed for session ${sessionId}:`, audioResult.error);
    return;
  }

  // Send to ElevenLabs agent
  const connection = getConnection(sessionId);
  if (connection?.agentConversation) {
    await sendAudioToAgent(sessionId, audioResult.audioData);
  } else {
    console.log(`⚠️ ElevenLabs not ready for session ${sessionId}, audio dropped`);
  }
}

/**
 * Clean up session resources
 */
function cleanupSession(sessionId) {
  console.log(`🧹 Cleaning up session: ${sessionId}`);

  const connection = getConnection(sessionId);
  const hadConnection = removeConnection(sessionId);
  
  console.log(`💾 Connection removed: ${hadConnection ? "Yes" : "Already gone"}`);

  // End ElevenLabs conversation
  if (connection?.agentConversation) {
    console.log("🤖 Ending ElevenLabs conversation...");
    endConversation(sessionId);
  } else {
    console.log("⚠️ No agent conversation to clean up");
  }

  console.log(`✅ Cleanup completed for session: ${sessionId}`);
}

module.exports = {
  handleKnowlarityStream,
  cleanupSession,
};