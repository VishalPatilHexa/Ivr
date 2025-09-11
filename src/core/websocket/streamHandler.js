const {
  addConnection,
  getConnection,
  removeConnection,
} = require("./connectionManager");
const { processInitialMetadata } = require("../metadata/metadataHandler");
const { processIncomingAudio } = require("../audio/audioProcessor");
const {
  sendAudioToCaller,
  handleControlMessage,
} = require("../../integrations/knowlarity/messageHandler");
const {
  createConversation,
  sendAudioToAgent,
  endConversation,
  setClientMessageHandler,
} = require("../../integrations/elevenlabs/agentService");
const config = require("../../config");

/**
 * Handle Knowlarity stream connection
 */
async function handleKnowlarityStream(websocket, urlPath) {
  const sessionId = urlPath.split("/")[2];

  // Validate session ID
  if (!sessionId || sessionId.trim() === "") {
    console.error(`❌ Invalid session ID extracted from URL: ${urlPath}`);
    websocket.close(1008, "Invalid session ID");
    return;
  }

  console.log(`📞 New Knowlarity connection: ${sessionId}`);

  // Setup message handling IMMEDIATELY - metadata arrives right after sessionId extraction
  let isFirstMessage = true;

  websocket.on("message", async (incomingMessage) => {
    try {
      console.log(`📥 Message received for session ${sessionId}: ${incomingMessage instanceof Buffer ? `Buffer(${incomingMessage.length})` : `Text(${incomingMessage.length})`}`);
      
      // Handle first message - could be metadata or audio
      if (isFirstMessage) {
        console.log(`🎆 Processing first message for session: ${sessionId}`);
        // Check if first message is JSON metadata or binary audio
        if (await tryProcessAsMetadata(incomingMessage, sessionId)) {
          isFirstMessage = false;
          return;
        } else {
          // Continue to process as audio below
          isFirstMessage = false;
        }
      }

      // Route audio and control messages
      console.log(`🔀 Routing message for session: ${sessionId}`);
      await routeIncomingMessage(incomingMessage, sessionId);
    } catch (error) {
      console.error(
        `❌ Error processing message for session ${sessionId}:`,
        error.message
      );
    }
  });

  // Setup connection lifecycle handlers
  websocket.on("close", () => {
    console.log(`📞 Call stream closed for session: ${sessionId}`);
    cleanupSession(sessionId);
  });

  websocket.on("error", (error) => {
    console.error(
      `❌ WebSocket error for session ${sessionId}:`,
      error.message
    );
    cleanupSession(sessionId);
  });

  // Store connection after message handler is set up
  addConnection(sessionId, {
    websocket,
    clientType: "knowlarity",
    agentConversation: null,
    elevenLabsInitialized: false,
  });
}

/**
 * Setup global audio streaming handler (called once during startup)
 */
function setupGlobalAudioStreaming() {
  setClientMessageHandler((currentSessionId, agentMessage) => {
    const connection = getConnection(currentSessionId);

    if (connection?.websocket?.readyState === 1) {
      // Handle agent audio
      if (agentMessage.type === "agent_audio" && agentMessage.audio) {
        console.log("🔊 Streaming agent audio to caller");
        sendAudioToCaller(currentSessionId, agentMessage.audio);
      }

      // Handle agent response text
      if (agentMessage.type === "agent_response" && agentMessage.text) {
        console.log(
          `💬 Agent response: ${agentMessage.text.substring(0, 100)}...`
        );
      }

      // Handle audio end
      if (agentMessage.type === "agent_audio_end") {
        console.log("✅ Agent finished speaking");
      }
    } else {
      console.log(
        `⚠️ Cannot send to caller - WebSocket connection lost for session: ${currentSessionId}`
      );
    }
  });
}

// Setup the global handler once when module loads
setupGlobalAudioStreaming();

/**
 * Initialize ElevenLabs agent after metadata is processed
 */
async function initializeAgentAfterMetadata(sessionId) {
  const connection = getConnection(sessionId);
  if (!connection || connection.agentConversation) {
    return; // Already initialized or no connection
  }

  console.log(`🤖 Initializing ElevenLabs conversation for session: ${sessionId}`);

  // Get dynamic fields from connection metadata
  const dynamicFields = connection?.knowlarityMetadata?.dynamicFields || {};
  console.log(`🔄 Using dynamic fields for ElevenLabs:`, JSON.stringify(dynamicFields, null, 2));

  // Use dynamic agentId if provided, otherwise use default
  const agentId = dynamicFields.agentId || config.elevenlabs.agentId;
  const treatmentType = dynamicFields.treatmentType || config.session.defaultTreatmentType;
  const language = dynamicFields.language || config.session.defaultLanguage;

  console.log(`🤖 Using agentId: ${agentId}`);
  console.log(`🎯 Using treatmentType: ${treatmentType}`);
  console.log(`🌐 Using language: ${language}`);

  try {
    const agentConversation = await createConversation(
      sessionId,
      treatmentType,
      agentId,
      dynamicFields
    );

    // Update connection with agent conversation
    connection.agentConversation = agentConversation;
    console.log(`💾 Agent conversation stored for session: ${sessionId}`);

    // Notify client that agent is ready
    if (connection?.websocket?.readyState === 1) {
      connection.websocket.send(
        JSON.stringify({
          type: "agent_ready",
          message: "ElevenLabs agent is ready for conversation",
        })
      );
      console.log("📤 Sent agent_ready notification to client");
    }
  } catch (error) {
    console.error(`❌ Failed to initialize ElevenLabs: ${error.message}`);
  }
}

/**
 * Try to process message as metadata, return true if successful
 */
async function tryProcessAsMetadata(incomingMessage, sessionId) {
  try {
    const messageStr = incomingMessage.toString();

    // Quick check - if it contains common metadata fields, try as JSON
    if (messageStr.includes("metadata") || messageStr.includes("callid")) {
      const metadataResult = await processInitialMetadata(incomingMessage, sessionId);
      
      if (metadataResult.success) {
        // Initialize ElevenLabs AFTER metadata is processed
        await initializeAgentAfterMetadata(sessionId);
      }
      
      return true;
    }

    return false;
  } catch (error) {
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
        const audioBuffer = Buffer.from(parsedMessage.audio, "base64");
        await handleIncomingAudio(audioBuffer, sessionId);
      } else {
        // Handle control message
        handleControlMessage(messageStr, sessionId);
      }
    } catch (parseError) {
      // Not JSON, treat as binary audio
      await handleIncomingAudio(incomingMessage, sessionId);
    }
  } else {
    // Handle text control messages
    handleControlMessage(incomingMessage.toString(), sessionId);
  }
}

/**
 * Handle incoming audio from caller
 */
async function handleIncomingAudio(audioBuffer, sessionId) {
  console.log(`🎵 Received audio from caller, size: ${audioBuffer.length} bytes`);

  // Process audio
  const audioResult = await processIncomingAudio(audioBuffer, sessionId);

  if (!audioResult.success) {
    console.error(
      `❌ Audio processing failed for session ${sessionId}:`,
      audioResult.error
    );
    return;
  }

  console.log(`📤 Base64 length: ${audioResult.audioData.length} characters`);

  // Send to ElevenLabs agent
  const connection = getConnection(sessionId);
  if (connection?.agentConversation) {
    console.log(`🔊 Sending audio to ElevenLabs agent for session: ${sessionId}`);
    await sendAudioToAgent(sessionId, audioResult.audioData);
  } else {
    console.log(`⚠️ No agent conversation available for session: ${sessionId} - audio dropped`);
  }
}

/**
 * Clean up session resources
 */
function cleanupSession(sessionId) {
  console.log(`🧹 Cleaning up session: ${sessionId}`);

  const connection = getConnection(sessionId);
  const hadConnection = removeConnection(sessionId);

  console.log(
    `💾 Connection removed: ${hadConnection ? "Yes" : "Already gone"}`
  );

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
