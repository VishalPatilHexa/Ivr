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

// Import service modules directly
const elevenLabsAgentService = require('../../services/elevenLabsAgent');
const callManagerService = require('../knowlarity/outboundCallManager');

/**
 * Initialize WebSocket handler - now using direct imports
 */
function initializeWebSocketHandler() {
  console.log('✅ WebSocket handler initialized with direct service imports');
}

/**
 * Main WebSocket connection handler - routes connections based on URL path
 */
function handleConnection(websocket, request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const urlPath = url.pathname;

  // Route to Knowlarity stream handler
  if (urlPath.startsWith("/knowlarity-stream/")) {
    handleKnowlarityStream(websocket, urlPath);
    return;
  }

  // Reject unknown connection types
  console.log("🔗 Unknown WebSocket connection, closing");
  websocket.close(1008, "Unknown connection type");
}

/**
 * ===============================================================================
 * MAIN KNOWLARITY STREAM HANDLER
 * ===============================================================================
 * Handles the complete audio streaming workflow between Knowlarity and ElevenLabs
 */
function handleKnowlarityStream(websocket, urlPath) {
  const sessionId = urlPath.split("/")[2];
  console.log("🔥 KNOWLARITY WEBSOCKET CONNECTION CREATED 🔥");
  console.log("📞 New Knowlarity call stream connection for session:", sessionId);
  console.log("🔍 URL Path:", urlPath);
  console.log("🌐 WebSocket Ready State:", websocket.readyState);
  console.log("📋 Connection Details:", {
    sessionId: sessionId,
    urlPath: urlPath,
    readyState: websocket.readyState,
    timestamp: new Date().toISOString()
  });

  // STEP 1: Store connection and setup call session
  // Detect client type from session ID or will be updated from metadata
  const clientType = sessionId.startsWith('web_') ? 'web_client' : 'knowlarity';
  
  activeConnections.set(sessionId, { 
    websocket, 
    clientType,
    connectedAt: new Date()
  });
  console.log("💾 Stored connection for session:", sessionId, "type:", clientType);
  console.log("📊 Total active connections:", activeConnections.size);

  let callSession = getCallSession(sessionId);
  if (!callSession) {
    // Create temporary session for external calls (Knowlarity/Gupshup)
    callSession = {
      sessionId: sessionId,
      status: "external_connection",
      createdAt: new Date(),
      isExternal: true,
      source: "knowlarity",
      metadata: {}, // Will be populated from initial metadata
    };
    console.log("✅ Temporary session created for external call:", sessionId);
    console.log("📋 Session details:", JSON.stringify(callSession, null, 2));
  } else {
    console.log("🔄 Using existing call session:", sessionId);
    console.log(
      "📋 Existing session details:",
      JSON.stringify(callSession, null, 2)
    );
  }

  // STEP 2: Initialize ElevenLabs conversation
  let agentConversation = null;

  const initializeAgentConversation = async () => {
    try {
      console.log(
        "🤖 Initializing ElevenLabs conversation for session:",
        sessionId
      );

      // Pass metadata to ElevenLabs
      const conversationContext = {
        treatmentType: callSession.patientData?.treatmentType || callSession.metadata?.treatmentType || "general consultation",
        patientName: callSession.metadata?.patientName || "Patient",
        patientAge: callSession.metadata?.patientAge || "",
        symptoms: callSession.metadata?.symptoms || "",
        medicalHistory: callSession.metadata?.medicalHistory || "",
        appointmentType: callSession.metadata?.appointmentType || "consultation",
        doctorName: callSession.metadata?.doctorName || "",
        customInstructions: callSession.metadata?.customInstructions || ""
      };

      agentConversation = await elevenLabsAgentService.createConversation(
        sessionId,
        conversationContext
      );

      // STEP 3: Setup bidirectional audio streaming
      setupAudioStreaming(sessionId);
      
      // STEP 4: Notify client that agent is ready
      const connection = activeConnections.get(sessionId);
      if (connection?.websocket?.readyState === WebSocket.OPEN) {
        connection.websocket.send(JSON.stringify({
          type: 'agent_ready',
          message: 'ElevenLabs agent is ready for conversation'
        }));
        console.log('📤 Sent agent_ready notification to client');
      }
    } catch (error) {
      console.error("❌ Error creating ElevenLabs conversation:", error);
      websocket.close(1011, "Failed to initialize conversation");
    }
  };

  // STEP 4: Setup message handling for audio streaming
  let isFirstMessage = true;
  let messageCount = 0;


  websocket.on("message", async (incomingMessage) => {
    console.log("🔥 KNOWLARITY MESSAGE RECEIVED 🔥");
    console.log("📬 Session:", sessionId);
    console.log("📦 Message Type:", incomingMessage instanceof Buffer ? "Binary" : "Text");
    console.log("📏 Message Size:", incomingMessage.length, "bytes");
    
    // Log first few messages in detail
    if (messageCount < 3) {
      console.log("📋 Raw Message (first 3 messages):", incomingMessage.toString());
    }

    try {
      messageCount++;
      console.log(`📬 Message #${messageCount} for session ${sessionId}:`,
        incomingMessage instanceof Buffer
          ? `Binary (${incomingMessage.length} bytes)`
          : "Text"
      );

      // Handle initial metadata from Knowlarity
      if (isFirstMessage) {
        console.log("🔥 FIRST MESSAGE FROM KNOWLARITY (METADATA) 🔥");
        console.log("🎆 Processing first message (metadata) for session:", sessionId);
        console.log("📋 First Message Content:", incomingMessage.toString());
        console.log("📏 First Message Size:", incomingMessage.length, "bytes");
        
        handleInitialMetadata(incomingMessage, sessionId);
        isFirstMessage = false;
        return;
      }

      // Route audio and control messages
      if (incomingMessage instanceof Buffer) {
        console.log("🔥 BINARY MESSAGE FROM KNOWLARITY 🔥");
        console.log("📦 Binary data size:", incomingMessage.length, "bytes");
        
        // Try to parse as JSON first (for client audio messages)
        try {
          const messageStr = incomingMessage.toString();
          const parsedMessage = JSON.parse(messageStr);
          
          console.log("📋 Binary message parsed as JSON:", Object.keys(parsedMessage));
          
          if (parsedMessage.type === 'audio-chunk' && parsedMessage.audio) {
            console.log("🎵 Processing JSON audio chunk for session:", sessionId);
            console.log("🎵 Audio chunk size:", parsedMessage.audio.length, "characters");
            // Convert base64 audio to binary
            const audioBuffer = Buffer.from(parsedMessage.audio, 'base64');
            await handleIncomingAudio(audioBuffer, sessionId, agentConversation);
          } else {
            console.log("📝 Processing JSON control message for session:", sessionId);
            console.log("📝 Control message type:", parsedMessage.type);
            handleControlMessages(messageStr, sessionId, agentConversation);
          }
        } catch (parseError) {
          // Not JSON, treat as binary audio
          console.log("🎵 Raw binary audio data from Knowlarity (not JSON)");
          console.log("🎵 Raw audio size:", incomingMessage.length, "bytes");
          await handleIncomingAudio(incomingMessage, sessionId, agentConversation);
        }
      } else {
        console.log("🔥 TEXT MESSAGE FROM KNOWLARITY 🔥");
        console.log("📝 Text message content:", incomingMessage.toString());
        handleControlMessages(incomingMessage, sessionId, agentConversation);
      }
    } catch (error) {
      console.error("❌ Error processing message for session:", sessionId);
      console.error("💥 Error details:", error.message);
      console.error(
        "🔍 Message type:",
        incomingMessage instanceof Buffer ? "Binary" : "Text"
      );
      console.error(
        "🔍 Message preview:",
        incomingMessage instanceof Buffer
          ? `Buffer(${incomingMessage.length})`
          : incomingMessage.toString().substring(0, 100)
      );
    }
  });

  websocket.on("error", (event) => {
    console.error("❌ WebSocket error for session:", event);
    console.error("💥 Error details:", event.message);
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
        if (agentMessage.type === "agent_audio" && agentMessage.audio) {
          console.log("🔊 Streaming agent audio to caller");

          // Check client type from stored connection data
          const isWebClient = connection.clientType === 'web_client';
          
          if (!isWebClient) {
            // KNOWLARITY FORMAT: Send as playAudio JSON message
            // Note: Knowlarity expects raw PCM audio with specific sample rate
            const knowlarityAudioMessage = {
              type: "playAudio",
              data: {
                audioContentType: "raw",
                sampleRate: 16000,  // ElevenLabs uses 16kHz
                audioContent: agentMessage.audio  // base64 encoded raw PCM
              }
            };
            
            console.log(`📤 Sending Knowlarity playAudio message (${agentMessage.audio.length} chars base64)`);
            
            try {
              connection.websocket.send(JSON.stringify(knowlarityAudioMessage));
              console.log("✅ Knowlarity audio JSON sent successfully");
            } catch (sendError) {
              console.error("❌ Failed to send Knowlarity audio:", sendError.message);
            }
          } else {
            // BROWSER FORMAT: Convert base64 to binary for web clients
            const audioBuffer = Buffer.from(agentMessage.audio, 'base64');
            console.log(`📤 Sending ${audioBuffer.length} bytes of audio to web client`);
            
            try {
              connection.websocket.send(audioBuffer);
              console.log("✅ Web client audio sent successfully");
            } catch (sendError) {
              console.error("❌ Failed to send web client audio:", sendError.message);
            }
          }
        }

        // RESPONSE TEXT LOGGING: Log agent text responses for monitoring/debugging
        if (agentMessage.type === "agent_response" && agentMessage.text) {
          console.log(
            "💬 Agent response:",
            agentMessage.text.substring(0, 100) + "..."
          );
        }

        // AUDIO END DETECTION: Log when agent finishes speaking (for turn-taking)
        if (agentMessage.type === "agent_audio_end") {
          console.log("✅ Agent finished speaking");
        }
      } else {
        // CONNECTION LOST: WebSocket connection is closed or not available
        console.log(
          "⚠️ Cannot send to caller - WebSocket connection lost for session:",
          sessionId
        );
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
    console.log("🔥 PARSING KNOWLARITY METADATA 🔥");
    console.log("📋 Raw metadata message:", metadataMessage.toString());
    
    // METADATA PARSING: Extract call information from client
    const connectionMetadata = JSON.parse(metadataMessage);
    console.log("📋 Received metadata for session:", sessionId);
    console.log("📊 Metadata keys:", Object.keys(connectionMetadata));
    console.log("📊 Metadata details:", JSON.stringify(connectionMetadata, null, 2));

    // UPDATE CLIENT TYPE: Update connection type based on metadata
    const connection = activeConnections.get(sessionId);
    if (connection) {
      if (connectionMetadata.type === 'web_client_connection') {
        connection.clientType = 'web_client';
        console.log("🔄 Updated client type to web_client for session:", sessionId);
        
        // Store metadata from web client
        if (connectionMetadata.metadata) {
          const callSession = getCallSession(sessionId);
          if (callSession) {
            callSession.metadata = { ...callSession.metadata, ...connectionMetadata.metadata };
            console.log("📋 Stored web client metadata:", JSON.stringify(connectionMetadata.metadata, null, 2));
          }
        }
      } else if (connectionMetadata.ivr_data || connectionMetadata.callid) {
        // This is Knowlarity metadata format
        connection.clientType = 'knowlarity';
        console.log("🔄 Confirmed client type as knowlarity for session:", sessionId);
      }
    }

    // STATUS UPDATE: Mark call as connected and store metadata
    // This updates the call management system with connection details
    handleCallStatusUpdate(sessionId, {
      status: "connected",
      knowlarityMetadata: connectionMetadata,
      isExternal: true,
    });
  } catch (jsonError) {
    console.error(
      "❌ Failed to parse initial metadata for session:",
      sessionId
    );
    console.error("🔍 Raw message:", metadataMessage.toString());
    console.error("💥 Parse error:", jsonError.message);

    // Try to continue with minimal metadata
    handleCallStatusUpdate(sessionId, {
      status: "connected",
      knowlarityMetadata: { error: "Failed to parse metadata" },
      isExternal: true,
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
  console.log(
    "🎵 Received audio from caller, size:",
    audioBuffer.length,
    "bytes"
  );


  // AUDIO FORMAT CONVERSION: Convert binary PCM audio to base64 format
  // Knowlarity sends raw binary PCM data, ElevenLabs expects base64 encoded audio
  const audioBase64Data = audioBuffer.toString('base64');

  // AUDIO FORWARDING: Send caller's audio to ElevenLabs agent for processing
  if (agentConversation) {
    // STREAM TO AGENT: This will trigger AI processing and eventually a response
    // The response will come back through the callback registered in setupAudioStreaming()
    await sendAudioToAgent(sessionId, audioBase64Data);
  } else {
    // AGENT NOT READY: ElevenLabs conversation not initialized yet - drop audio
    console.log("⚠️ ElevenLabs not ready, audio dropped");
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
    console.log("📋 Control message:", controlData.type);

    // CONTROL MESSAGE ROUTING: Handle different types of call events
    switch (controlData.type) {
      case "call_start":
        // CALL ACTIVATION: Mark call as active (beyond just connected)
        handleCallStatusUpdate(sessionId, { status: "active" });
        break;

      case "call_end":
        // CALL TERMINATION: Clean up all resources for this call
        handleCallStatusUpdate(sessionId, { status: "completed" });
        if (agentConversation) {
          // AGENT CLEANUP: End the ElevenLabs conversation and close WebSocket
          endConversation(sessionId);
        }
        break;

      case "dtmf":
        // DTMF TONES: Handle keypad input from caller (could be used for menu navigation)
        console.log("📞 DTMF received:", controlData.digit);
        // TODO: Could forward DTMF to agent for handling menu options
        break;
    }
  } catch (jsonError) {
    // INVALID CONTROL MESSAGE: Not valid JSON, log and continue
    console.log("⚠️ Non-JSON control message received");
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
  websocket.on("close", () => {
    console.log("📞 Call stream closed for session:", sessionId);
    cleanupSession(sessionId, agentConversation);
  });

  // Handle connection errors
  websocket.on("error", (connectionError) => {
    console.error("❌ WebSocket error:", connectionError);
    cleanupSession(sessionId, agentConversation);
    handleCallStatusUpdate(sessionId, {
      status: "failed",
      reason: connectionError.message,
    });
  });
}




/**
 * Cleanup session resources
 */
function cleanupSession(sessionId, agentConversation) {
  console.log("🧹 Cleaning up session:", sessionId);

  // Check if connection exists before cleanup
  const hadConnection = activeConnections.has(sessionId);
  activeConnections.delete(sessionId);
  console.log(
    `💾 Connection removed: ${hadConnection ? "Yes" : "Already gone"}`
  );
  console.log(`📊 Remaining connections: ${activeConnections.size}`);

  if (agentConversation) {
    console.log("🤖 Ending ElevenLabs conversation...");
    endConversation(sessionId);
  } else {
    console.log("⚠️ No agent conversation to clean up");
  }

  // Update status with external flag
  handleCallStatusUpdate(sessionId, {
    status: "disconnected",
    isExternal: true,
    reason: "WebSocket connection closed",
  });
  console.log("✅ Cleanup completed for session:", sessionId);
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
    connection.websocket.send(
      JSON.stringify({
        type: "transfer",
        data: { textContent: targetPhoneNumber },
      })
    );
    console.log(`📞 Transferring call ${sessionId} to ${targetPhoneNumber}`);
  } else {
    console.error(
      `❌ Cannot transfer call ${sessionId} - connection not found`
    );
  }
}

/**
 * Terminate call stream
 */
function terminateStream(sessionId) {
  const connection = activeConnections.get(sessionId);
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    connection.websocket.send(JSON.stringify({ type: "disconnect" }));
    console.log(`📞 Terminating stream for call ${sessionId}`);
  } else {
    console.error(
      `❌ Cannot terminate stream ${sessionId} - connection not found`
    );
  }
}

/**
 * Stop audio playback
 */
function killAudio(sessionId) {
  const connection = activeConnections.get(sessionId);
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    connection.websocket.send(JSON.stringify({ type: "killAudio" }));
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
  return callManagerService.getCallSession(sessionId);
}

// Update call status
function handleCallStatusUpdate(sessionId, statusUpdate) {
  // Validate input parameters
  if (!sessionId) {
    console.log("⚠️ Invalid sessionId provided for status update:", sessionId);
    return;
  }
  
  if (!statusUpdate || !statusUpdate.status) {
    console.log("⚠️ Invalid statusUpdate provided for session:", sessionId);
    return;
  }

  console.log(
    "🔄 Status update for session:",
    sessionId,
    "Status:",
    statusUpdate.status
  );

  try {
    // Check if this is a web client session (sessions starting with 'web_')
    const isWebClientSession = sessionId.startsWith('web_');
    
    if (isWebClientSession) {
      console.log("ℹ️ Web client session detected - attempting status update");
    }

    callManagerService.handleCallStatusUpdate(sessionId, statusUpdate);
    console.log("✅ Status update successful for session:", sessionId);
  } catch (error) {
    console.log(
      "⚠️ Call session not found for status update:",
      sessionId,
      "gracefully handling this case"
    );
    console.log("🔍 Error details:", error.message);
    
    // For external sessions (Knowlarity/Gupshup) or web client sessions, this is expected behavior
    if (statusUpdate.isExternal || sessionId.startsWith('web_')) {
      console.log(
        "ℹ️ This is an external/web client session - status update failure is normal and handled gracefully"
      );
      
      // Log the attempted status update for monitoring purposes
      console.log("📊 Attempted status update details:", {
        sessionId,
        status: statusUpdate.status,
        isExternal: statusUpdate.isExternal,
        timestamp: new Date().toISOString()
      });
      
      // Continue gracefully without throwing
      return;
    }
    
    // For internal sessions, we might want to log this as a more serious issue
    console.error("❌ Unexpected status update failure for internal session:", sessionId);
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
  return elevenLabsAgentService.createConversation(sessionId, treatmentType);
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
  elevenLabsAgentService.setClientMessageHandler(messageHandler);
}

/**
 * AUDIO TO AGENT: Send caller's audio to ElevenLabs agent for processing
 * This triggers the AI to analyze speech and generate a response
 */
function sendAudioToAgent(sessionId, audioData) {
  return elevenLabsAgentService.sendAudioToAgent(sessionId, audioData);
}

/**
 * END AGENT SESSION: Terminate ElevenLabs conversation and cleanup resources
 */
function endConversation(sessionId) {
  return elevenLabsAgentService.endConversation(sessionId);
}

module.exports = {
  handleConnection,
  transferCall,
  terminateStream,
  killAudio,
  cleanup,
  shutdown,
};
