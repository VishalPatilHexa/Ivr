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
const elevenLabsAgentService = require("../../services/elevenLabsAgent");

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
  websocket.close(1008, "Unknown connection type");
}

/**
 * ===============================================================================
 * AUDIO PROCESSING UTILITIES
 * ===============================================================================
 */

/**
 * Amplify audio volume by multiplying sample values
 * Assumes 16-bit PCM audio (little endian)
 */
function amplifyAudioVolume(audioBuffer, amplificationFactor = 2.0) {
  try {
    // Create a copy to avoid modifying original buffer
    const amplifiedBuffer = Buffer.from(audioBuffer);

    // Process 16-bit samples (2 bytes each)
    for (let i = 0; i < amplifiedBuffer.length - 1; i += 2) {
      // Read 16-bit little endian sample
      let sample = amplifiedBuffer.readInt16LE(i);

      // Amplify the sample
      sample = Math.round(sample * amplificationFactor);

      // Clamp to prevent overflow/distortion
      sample = Math.max(-32768, Math.min(32767, sample));

      // Write back the amplified sample
      amplifiedBuffer.writeInt16LE(sample, i);
    }

    return amplifiedBuffer;
  } catch (error) {
    console.error("❌ Error amplifying audio:", error);
    return audioBuffer; // Return original on error
  }
}

/**
 * ===============================================================================
 * MAIN KNOWLARITY STREAM HANDLER
 * ===============================================================================
 * Handles the complete audio streaming workflow between Knowlarity and ElevenLabs
 */
function handleKnowlarityStream(websocket, urlPath) {
  const sessionId = urlPath.split("/")[2];
  console.log(
    "📞 New Knowlarity call stream connection for session:",
    sessionId
  );
  console.log("🔍 URL Path:", urlPath);
  console.log("🌐 WebSocket Ready State:", websocket.readyState);

  // STEP 1: Store connection and setup call session
  // Detect client type from session ID or will be updated from metadata
  const clientType = sessionId.startsWith("web_") ? "web_client" : "knowlarity";

  activeConnections.set(sessionId, {
    websocket,
    clientType,
    connectedAt: new Date(),
    agentConversation: null, // Will be set when ElevenLabs agent is initialized
  });
  console.log(
    "💾 Stored connection for session:",
    sessionId,
    "type:",
    clientType
  );
  console.log("📊 Total active connections:", activeConnections.size);

  // Create temporary session for external calls
  const callSession = {
    sessionId: sessionId,
    status: "external_connection",
    createdAt: new Date(),
    isExternal: true,
  };

  // STEP 4: Setup message handling for audio streaming
  let isFirstMessage = true;
  let messageCount = 0;

  websocket.on("message", async (incomingMessage) => {
    try {
      messageCount++;

      // Check if call has already ended
      let connection = activeConnections.get(sessionId);
      if (connection?.callEnded) {
        console.log(
          "🚫 Ignoring message - call already ended for session:",
          sessionId
        );
        return;
      }

      // Handle initial metadata from Knowlarity
      if (isFirstMessage) {
        console.log(`🎆 Processing first message for session: ${sessionId}`);
        // Set flag IMMEDIATELY and SYNCHRONOUSLY to prevent race condition
        isFirstMessage = false;

        let metadata = await tryProcessAsMetadata(incomingMessage, sessionId);
        if (metadata) {
          await initializeAgentConversationAfterMetaData(sessionId, metadata);
          return;
        } else {
          console.log(
            `📤 First message was audio, not metadata for session: ${sessionId}`
          );
          // Initialize with default values if no metadata
          await initializeAgentConversationAfterMetaData(sessionId, null);
          // Continue processing this message as audio - don't return
        }
      }

      // Route audio and control messages
      connection = activeConnections.get(sessionId);
      const agentConversation = connection?.agentConversation;

      if (incomingMessage instanceof Buffer) {
        // Try to parse as JSON first (for client audio messages)
        try {
          const messageStr = incomingMessage.toString();
          const parsedMessage = JSON.parse(messageStr);

          if (parsedMessage.type === "audio-chunk" && parsedMessage.audio) {
            // Convert base64 audio to binary
            const audioBuffer = Buffer.from(parsedMessage.audio, "base64");
            await handleIncomingAudio(
              audioBuffer,
              sessionId,
              agentConversation
            );
          } else {
            handleControlMessages(messageStr, sessionId, agentConversation);
          }
        } catch (parseError) {
          // Not JSON, treat as binary audio
          await handleIncomingAudio(
            incomingMessage,
            sessionId,
            agentConversation
          );
        }
      } else {
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
  setupConnectionLifecycle(websocket, sessionId);
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
          // Check client type from stored connection data
          const isWebClient = connection.clientType === "web_client";

          if (!isWebClient) {
            // KNOWLARITY FORMAT: Send as playAudio JSON message
            // Note: Knowlarity expects raw PCM audio with specific sample rate
            const knowlarityAudioMessage = {
              type: "playAudio",
              data: {
                audioContentType: "raw",
                sampleRate: 16000, // ElevenLabs uses 16kHz
                audioContent: agentMessage.audio, // base64 encoded raw PCM
              },
            };

            try {
              connection.websocket.send(JSON.stringify(knowlarityAudioMessage));
            } catch (sendError) {
              console.error(
                "❌ Failed to send Knowlarity audio:",
                sendError.message
              );
            }
          } else {
            // BROWSER FORMAT: Convert base64 to binary for web clients
            const audioBuffer = Buffer.from(agentMessage.audio, "base64");

            try {
              connection.websocket.send(audioBuffer);
            } catch (sendError) {
              console.error(
                "❌ Failed to send web client audio:",
                sendError.message
              );
            }
          }
        }

        // RESPONSE TEXT LOGGING: Log agent text responses for monitoring/debugging
        if (agentMessage.type === "agent_response" && agentMessage.text) {
        }

        // AUDIO END DETECTION: Log when agent finishes speaking (for turn-taking)
        if (agentMessage.type === "agent_audio_end") {
        }

        // CALL END: Close Knowlarity WebSocket when ElevenLabs conversation ends
        if (agentMessage.type === "call_end") {
          console.log("📞 Ending call for session:", sessionId);

          // Mark session as ended to prevent further processing
          connection.callEnded = true;

          // Send call end signal to Knowlarity
          if (
            !connection.clientType ||
            connection.clientType === "knowlarity"
          ) {
            try {
              connection.websocket.send(
                JSON.stringify({
                  type: "call_end",
                  message: "Call completed successfully",
                })
              );
            } catch (error) {
              console.log(
                "📞 WebSocket already closed or error sending call_end"
              );
            }
          }

          // Close WebSocket connection immediately
          if (connection.websocket?.readyState === WebSocket.OPEN) {
            connection.websocket.close(1000, "Call completed");
          }

          // Clean up the connection
          activeConnections.delete(sessionId);

          return;
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
 * Try to process incoming message as metadata
 */
async function tryProcessAsMetadata(incomingMessage, sessionId) {
  try {
    const messageStr = incomingMessage.toString();

    // Quick check - if it contains common metadata fields, try as JSON
    if (messageStr.includes("metadata") || messageStr.includes("callid")) {
      const metadataResult = await processInitialMetadata(
        incomingMessage,
        sessionId
      );
      console.log(
        `🔍 Metadata processed for session: ${sessionId}`,
        metadataResult
      );

      return metadataResult?.metadata;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Process initial metadata message from Knowlarity
 */
async function processInitialMetadata(metadataMessage, sessionId) {
  try {
    console.log(`📋 Processing metadata for session: ${sessionId}`);

    // Parse metadata (handle single quotes format)
    const rawMetadata = metadataMessage.toString();
    const metadata = parseKnowlarityMetadata(rawMetadata);

    // Store metadata in connection
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.clientType = metadata.callid ? "knowlarity" : "web_client";
      connection.knowlarityMetadata = {
        raw: metadataMessage.toString(),
        parsed: metadata,
        callid: metadata.callid,
        virtual_number: metadata.virtual_number,
        customer_number: metadata.customer_number,
        metadata: metadata.metadata,
      };
    }

    // Update status
    handleCallStatusUpdate(sessionId, { status: "connected" });

    return { success: true, metadata };
  } catch (error) {
    console.error("❌ Failed to process metadata:", error.message);
    await sendErrorResponse(getConnection(sessionId), error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Parse Knowlarity metadata format
 */
function parseKnowlarityMetadata(rawMetadata) {
  try {
    // Clean up the raw metadata - remove any leading/trailing whitespace and BOM
    let cleanMetadata = rawMetadata.trim();

    // Remove BOM (Byte Order Mark) if present
    if (cleanMetadata.charCodeAt(0) === 0xfeff) {
      cleanMetadata = cleanMetadata.slice(1);
    }

    // Try parsing as JSON first (in case it's already proper JSON)
    try {
      const directParse = JSON.parse(cleanMetadata);

      // Check if the result is a string (double-encoded JSON)
      if (typeof directParse === "string") {
        const secondParse = JSON.parse(directParse.replace(/'/g, '"'));
        return processMetadataObject(secondParse);
      }

      return processMetadataObject(directParse);
    } catch (directError) {
      // Handle the single quote format from Knowlarity
      const jsonString = cleanMetadata.replace(/'/g, '"');
      const metadata = JSON.parse(jsonString);
      return processMetadataObject(metadata);
    }
  } catch (error) {
    console.error("❌ Failed to parse metadata:", error.message);
    throw new Error(`Failed to parse metadata: ${error.message}`);
  }
}

/**
 * Process metadata object and decode nested fields
 */
function processMetadataObject(metadata) {
  // Decode URL-encoded metadata if present
  if (metadata.metadata) {
    try {
      const decodedMetadataString = decodeURIComponent(metadata.metadata);
      metadata.metadata = JSON.parse(decodedMetadataString);
    } catch (error) {
      metadata.metadata = null;
    }
  }

  return metadata;
}

/**
 * Get connection helper
 */
function getConnection(sessionId) {
  return activeConnections.get(sessionId);
}

/**
 * Send success response to Knowlarity
 */
async function sendSuccessResponse(connection) {
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    const ackMessage = JSON.stringify({
      type: "metadata_received",
      status: "success",
      message: "Metadata processed successfully",
    });

    connection.websocket.send(ackMessage);
  }
}

/**
 * Send error response to Knowlarity
 */
async function sendErrorResponse(connection, errorMessage) {
  if (connection?.websocket?.readyState === WebSocket.OPEN) {
    const errorResponse = JSON.stringify({
      type: "metadata_error",
      status: "error",
      message: "Failed to parse metadata",
      error: errorMessage,
    });

    connection.websocket.send(errorResponse);
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
  // AUDIO PROCESSING: Pure volume amplification only - NO noise processing to prevent artifacts
  // Knowlarity sends raw binary PCM data, ElevenLabs expects base64 encoded audio
  const amplifiedAudioBuffer = amplifyAudioVolume(audioBuffer, 2.0); // 2.0x standard amplification rate

  const audioBase64Data = amplifiedAudioBuffer.toString("base64");

  // AUDIO FORWARDING: Send caller's audio to ElevenLabs agent for processing
  if (agentConversation) {
    // STREAM TO AGENT: This will trigger AI processing and eventually a response
    // The response will come back through the callback registered in setupAudioStreaming()
    await sendAudioToAgent(sessionId, audioBase64Data);
  } else {
    // AGENT NOT READY: ElevenLabs conversation not initialized yet - drop audio
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
        // TODO: Could forward DTMF to agent for handling menu options
        break;
    }
  } catch (jsonError) {
    // INVALID CONTROL MESSAGE: Not valid JSON, log and continue
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
function setupConnectionLifecycle(websocket, sessionId) {
  // Handle connection close
  websocket.on("close", () => {
    // Close ElevenLabs WebSocket connection to end the conversation
    const connection = activeConnections.get(sessionId);
    if (connection?.agentConversation?.agentWebSocket) {
      connection.agentConversation.agentWebSocket.close();
    }
  });

  // Handle connection errors
  websocket.on("error", (connectionError) => {
    console.error("❌ WebSocket error:", connectionError);

    // Close ElevenLabs WebSocket connection on error
    const connection = activeConnections.get(sessionId);
    if (connection?.agentConversation?.agentWebSocket) {
      connection.agentConversation.agentWebSocket.close();
    }

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
  activeConnections.delete(sessionId);

  if (agentConversation) {
    endConversation(sessionId);
  } else {
  }

  // Update status with external flag
  handleCallStatusUpdate(sessionId, {
    status: "disconnected",
    isExternal: true,
    reason: "WebSocket connection closed",
  });
}

/**
 * ===============================================================================
 * CALL CONTROL FUNCTIONS
 * ===============================================================================
 */

/**
 * ===============================================================================
 * SYSTEM MANAGEMENT
 * ===============================================================================
 */

/**
 * ===============================================================================
 * SERVICE INTEGRATION FUNCTIONS
 * ===============================================================================
 */

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

  try {
    // Check if this is a web client session (sessions starting with 'web_')
    const isWebClientSession = sessionId.startsWith("web_");

    if (isWebClientSession) {
    }

    // Status updates for external calls are handled gracefully
    console.log("📊 Status update logged:", {
      sessionId,
      status: statusUpdate.status,
    });
  } catch (error) {
    // For external sessions (Knowlarity/Gupshup) or web client sessions, this is expected behavior
    if (statusUpdate.isExternal || sessionId.startsWith("web_")) {
      return;
    }

    console.error(
      "❌ Unexpected status update failure for internal session:",
      sessionId
    );
  }
}

// ===============================================================================
// ELEVENLABS AGENT SERVICE INTEGRATION
// ===============================================================================
// These functions create the bridge between WebSocket handler and ElevenLabs agent

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

async function initializeAgentConversationAfterMetaData(sessionId, metadata) {
  try {
    console.log(
      "🤖 Initializing ElevenLabs conversation for session:",
      sessionId
    );

    // Extract agentId and treatmentType from decoded metadata
    let agentId, treatmentType;

    if (metadata && metadata.metadata) {
      agentId = metadata.metadata.agentId;
      treatmentType = metadata.metadata.treatmentType;
    } else {
      // Use defaults if no metadata provided
      console.log(
        "⚠️ No metadata provided, using defaults for session:",
        sessionId
      );
      agentId = "default_agent_id"; // You should replace with actual default
      treatmentType = "Piles";
    }

    if (!agentId || agentId === "default_agent_id") {
      console.warn("⚠️ Using default agentId for session:", sessionId);
      // Continue with default - don't return
    }

    // Create ElevenLabs conversation with metadata from Knowlarity
    const agentConversation = await elevenLabsAgentService.createConversation(
      agentId,
      sessionId,
      {
        treatmentType: treatmentType || "Piles", // fallback
      }
    );

    // Store the agent conversation in the connection for cleanup
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.agentConversation = agentConversation;
    }

    // Setup bidirectional audio streaming
    setupAudioStreaming(sessionId);

    // Send acknowledgment to Knowlarity
    await sendSuccessResponse(connection);

    // Notify client that agent is ready
    if (connection?.websocket?.readyState === WebSocket.OPEN) {
      connection.websocket.send(
        JSON.stringify({
          type: "agent_ready",
          message: "ElevenLabs agent is ready for conversation",
        })
      );
    }

    console.log(
      "✅ Agent conversation initialized successfully for session:",
      sessionId
    );
  } catch (error) {
    console.error("❌ Error creating ElevenLabs conversation:", error);

    // Send error response to Knowlarity
    const connection = activeConnections.get(sessionId);
    await sendErrorResponse(connection, error.message);

    // Close connection on initialization failure
    if (connection?.websocket?.readyState === WebSocket.OPEN) {
      connection.websocket.close(1011, "Failed to initialize conversation");
    }
  }
}

/**
 * Cleanup dead connections
 */
function cleanup() {
  activeConnections.forEach((connection, sessionId) => {
    if (connection.websocket?.readyState === WebSocket.CLOSED) {
      cleanupSession(sessionId, connection.agentConversation);
    }
  });
}

module.exports = {
  handleConnection,
  activeConnections,
  cleanupSession,
  cleanup,
};
