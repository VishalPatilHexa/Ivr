const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

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
  console.log("🌐 NEW WEBSOCKET CONNECTION RECEIVED");
  console.log("🔗 Request URL:", request.url);
  console.log("🏠 Request Host:", request.headers.host);
  console.log("📊 Request Headers:", JSON.stringify(request.headers, null, 2));
  
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const urlPath = url.pathname;
    
    console.log("📍 Parsed URL path:", urlPath);
    console.log("🌐 WebSocket readyState:", websocket.readyState);
    console.log("🕐 Timestamp:", new Date().toISOString());

    // Route to Knowlarity stream handler
    if (urlPath.startsWith("/knowlarity-stream/")) {
      console.log("➡️ ROUTING TO KNOWLARITY HANDLER");
      handleKnowlarityStream(websocket, urlPath);
      return;
    }

    // Route to Acephone stream handler
    if (urlPath.startsWith("/acephone")) {
      console.log("➡️ ROUTING TO ACEPHONE HANDLER");
      console.log("🎯 About to call handleAcephoneStream...");
      try {
        handleAcephoneStream(websocket, urlPath);
        console.log("✅ handleAcephoneStream called successfully");
      } catch (acephoneError) {
        console.error("❌ Error in handleAcephoneStream:", acephoneError);
        console.error("📊 Stack trace:", acephoneError.stack);
      }
      return;
    }

    // Reject unknown connection types
    console.log("❌ UNKNOWN CONNECTION TYPE, CLOSING WEBSOCKET");
    console.log("❌ URL path was:", urlPath);
    websocket.close(1008, "Unknown connection type");
  } catch (routingError) {
    console.error("❌ ERROR IN CONNECTION ROUTING:", routingError);
    console.error("📊 Stack trace:", routingError.stack);
    websocket.close(1011, "Internal server error");
  }
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
function calculateOptimalAmplification(audioBuffer, targetPeakLevel = 0.8) {
  let maxSample = 0;

  for (let i = 0; i < audioBuffer.length; i += 2) {
    const sample = Math.abs(audioBuffer.readInt16LE(i));
    maxSample = Math.max(maxSample, sample);
  }

  // Calculate factor to reach target level (80% of max to avoid clipping)
  const targetValue = 32767 * targetPeakLevel;
  return maxSample > 0 ? targetValue / maxSample : 1.0;
}

function amplifyAudioVolume(audioBuffer, targetPeakLevel = 0.8) {
  try {
    // Create a copy to avoid modifying original buffer
    const amplifiedBuffer = Buffer.from(audioBuffer);
    const optimalAmplification = calculateOptimalAmplification(
      amplifiedBuffer,
      targetPeakLevel
    );

    // Process 16-bit samples (2 bytes each)
    for (let i = 0; i < amplifiedBuffer.length; i += 2) {
      // Read 16-bit little endian sample
      let sample = amplifiedBuffer.readInt16LE(i);

      // Amplify the sample
      sample = Math.round(sample * optimalAmplification);

      // Clamp to prevent overflow/distortion (though shouldn't be needed with proper calculation)
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
 * ACEPHONE STREAM HANDLER
 * ===============================================================================
 * Handles Acephone WebSocket protocol with proper event sequence and audio format
 */
function handleAcephoneStream(websocket, urlPath) {
  console.log("🚀 ACEPHONE STREAM HANDLER STARTED");
  console.log("🌐 WebSocket provided:", !!websocket);
  console.log("🔗 URL Path provided:", urlPath);
  
  try {
    // Generate unique streamSid for Acephone connection
    const streamSid = uuidv4();
    const sessionId = streamSid; // Use streamSid as sessionId for internal tracking
    
    console.log("📞 NEW ACEPHONE CALL STREAM CONNECTION FOR STREAMSID:", streamSid);
    console.log("🔍 URL Path:", urlPath);
    console.log("🌐 WebSocket readyState:", websocket.readyState);
    console.log("🕐 Connection timestamp:", new Date().toISOString());
    
    // Validate required parameters
    if (!websocket) {
      throw new Error("WebSocket is null or undefined");
    }
    if (!urlPath) {
      throw new Error("URL path is null or undefined");
    }

  // Store connection with Acephone-specific properties (no static metadata)
  activeConnections.set(sessionId, {
    websocket,
    clientType: "acephone",
    connectedAt: new Date(),
    agentConversation: null,
    acephoneMetadata: null, // Will be populated from start event
    streamSid: streamSid,
    sequenceNumber: 0,
    callStarted: false,
    agentHasSpoken: false,
    metadataReceived: false,
    outboundChunkNumber: 1, // Track chunk numbers for outbound media
    streamStartTime: null // Track stream start time for timestamps
  });

  console.log("💾 Stored Acephone connection for streamSid:", streamSid);
  console.log("⏳ Waiting for Acephone to send connected event first...");

  // DO NOT send 'connected' event to Acephone - they send it to us first
  // According to PDF Section 2.1: "connected event is sent TO the vendor (us) FROM Acephone"

  // Setup message handling for Acephone WebSocket protocol
  websocket.on("message", async (incomingMessage) => {
    try {
      let connection = activeConnections.get(sessionId);
      if (connection?.callEnded) {
        console.log("🚫 Ignoring message - call already ended for streamSid:", streamSid);
        return;
      }

      // Parse incoming Acephone message
      const messageStr = incomingMessage.toString();
      const parsedMessage = JSON.parse(messageStr);
      
      console.log("📨 Acephone event received:", parsedMessage.event);
      console.log("📋 Full Acephone message:", JSON.stringify(parsedMessage, null, 2));

      switch (parsedMessage.event) {
        case "connected":
          console.log("📡 Acephone sent connected event - handshake complete");
          console.log("✅ Ready to receive start event with metadata");
          break;
          
        case "start":
          await handleAcephoneStart(sessionId, parsedMessage);
          break;
          
        case "media":
          await handleAcephoneMedia(sessionId, parsedMessage);
          break;
          
        case "stop":
          await handleAcephoneStop(sessionId);
          break;
          
        case "dtmf":
          handleAcephoneDtmf(sessionId, parsedMessage);
          break;
          
        case "mark":
          handleAcephoneMark(sessionId, parsedMessage);
          break;
          
        default:
          console.log("❓ Unknown Acephone event:", parsedMessage.event);
      }
    } catch (error) {
      console.error("❌ Error processing Acephone message for streamSid:", streamSid, error.message);
    }
  });

  websocket.on("error", (event) => {
    console.error("❌ Acephone WebSocket error for streamSid:", streamSid);
    console.error("❌ Error details:", event);
    console.error("❌ This might cause immediate call drop!");
  });

  websocket.on("close", (code, reason) => {
    console.log("🔌 Acephone WebSocket closed for streamSid:", streamSid);
    console.log("🔍 Close code:", code);
    console.log("🔍 Close reason:", reason ? reason.toString() : "No reason provided");
    
    // Common close codes:
    // 1000 = Normal closure, 1001 = Going away, 1002 = Protocol error, 1011 = Server error
    if (code !== 1000) {
      console.error(`⚠️ Abnormal close detected! Code: ${code} - this indicates an error`);
    }
    
    handleAcephoneStop(sessionId);
  });

  console.log("🔧 Acephone stream handler setup completed for streamSid:", streamSid);
  
  } catch (handlerError) {
    console.error("❌ CRITICAL ERROR IN ACEPHONE HANDLER:", handlerError);
    console.error("📊 Stack trace:", handlerError.stack);
    
    // Close the websocket with error code
    if (websocket && websocket.readyState === websocket.OPEN) {
      websocket.close(1011, "Internal server error");
    }
  }
}

/**
 * Send event to Acephone with proper structure
 */
function sendAcephoneEvent(websocket, sessionId, eventData) {
  const connection = activeConnections.get(sessionId);
  if (!connection) return;

  const message = {
    event: eventData.event,
    sequenceNumber: ++connection.sequenceNumber,
    streamSid: connection.streamSid,
    ...eventData
  };

  if (websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(message));
    console.log(`📤 Sent Acephone event: ${eventData.event}`);
  }
}

/**
 * Handle Acephone 'start' event
 */
async function handleAcephoneStart(sessionId, startMessage) {
  const connection = activeConnections.get(sessionId);
  if (!connection) return;

  console.log("🎬 Acephone call started for streamSid:", connection.streamSid);
  console.log("🔊 Audio format:", startMessage.start?.mediaFormat);
  console.log("📋 Start event metadata:", JSON.stringify(startMessage.start, null, 2));

  connection.callStarted = true;
  connection.mediaFormat = startMessage.start?.mediaFormat;
  connection.streamStartTime = Date.now(); // Record stream start time for timestamps
  
  // Extract and validate metadata from Acephone start event
  if (!startMessage.start?.customParameters?.metadata) {
    console.error("❌ No metadata found in Acephone start event!");
    connection.websocket.close(1008, "Missing required metadata");
    return;
  }

  const metadata = startMessage.start.customParameters.metadata;
  
  // Validate required metadata fields
  if (!metadata.agentId) {
    console.error("❌ Missing required agentId in metadata!");
    connection.websocket.close(1008, "Missing agentId in metadata");
    return;
  }

  // Store the extracted metadata
  connection.acephoneMetadata = metadata;
  connection.metadataReceived = true;
  connection.acephoneStartMetadata = startMessage.start;
  
  // IMPORTANT: Use Acephone's streamSid, not our generated one
  connection.acephoneStreamSid = startMessage.start.streamSid;
  console.log(`🆔 Using Acephone's streamSid: ${connection.acephoneStreamSid} (not our generated: ${connection.streamSid})`);

  console.log("✅ Extracted Acephone metadata:", JSON.stringify(metadata, null, 2));
  console.log("🎯 Using agentId:", metadata.agentId);
  console.log("🏥 Treatment type:", metadata.treatmentType || "Not specified");
  console.log("🗣️ Language:", metadata.language || "Not specified");

  // Now initialize ElevenLabs conversation with extracted metadata
  try {
    console.log("🚀 Initializing ElevenLabs with extracted metadata...");
    await initializeAgentConversationAfterMetaData(sessionId, { metadata: metadata });
    console.log("✅ Acephone agent conversation initialized for streamSid:", connection.streamSid);
  } catch (error) {
    console.error("❌ Failed to initialize Acephone conversation:", error);
    connection.websocket.close(1011, "Failed to initialize conversation");
  }
}

/**
 * Handle Acephone 'media' event with µ-law audio
 */
async function handleAcephoneMedia(sessionId, mediaMessage) {
  const connection = activeConnections.get(sessionId);
  
  if (!connection?.metadataReceived) {
    console.log("⏳ Media received before metadata extracted - ignoring");
    return;
  }

  if (!connection?.callStarted) {
    console.log("⏳ Media received before call started - ignoring");
    return;
  }

  if (!connection.agentConversation) {
    console.log("⏳ Media received before agent ready - ignoring");
    return;
  }

  // Wait for agent to send initial greeting before processing user audio
  if (!connection.agentHasSpoken) {
    console.log("⏳ Media received before agent greeting - ignoring");
    return;
  }

  try {
    // Extract µ-law audio payload (base64 encoded)
    const ulawAudioBase64 = mediaMessage.media?.payload;
    if (!ulawAudioBase64) {
      console.log("⚠️ No payload in media message");
      return;
    }

    console.log(`🎤 Processing Acephone media chunk ${mediaMessage.media?.chunk} (${ulawAudioBase64.length} chars base64)`);

    // Convert base64 to µ-law buffer
    const ulawBuffer = Buffer.from(ulawAudioBase64, "base64");
    console.log(`📦 Decoded ${ulawBuffer.length} bytes µ-law audio`);

    // Skip silent audio (all 0xFF bytes indicate silence in µ-law)
    const isSilent = ulawBuffer.every(byte => byte === 0xFF);
    if (isSilent) {
      console.log("🔇 Skipping silent audio chunk");
      return;
    }

    // Check for valid µ-law data (should not be all zeros or all same value)
    const uniqueBytes = new Set(ulawBuffer);
    if (uniqueBytes.size < 3) {
      console.log(`⚠️ Suspicious audio data - only ${uniqueBytes.size} unique byte values`);
    }

    // INCOMING AUDIO PROCESSING (Acephone → ElevenLabs)
    // PDF: Acephone sends µ-law/8000 base64 encoded audio
    
    // Step 1: Convert µ-law (8kHz) to PCM (8kHz)
    const pcm8Buffer = convertUlawToPcm(ulawBuffer);
    console.log(`🔄 Converted µ-law to ${pcm8Buffer.length} bytes PCM (8kHz)`);
    
    // Step 2: Upsample PCM from 8kHz to 16kHz for ElevenLabs
    const pcm16Buffer = upsamplePcm8to16(pcm8Buffer);
    console.log(`⬆️ Upsampled to ${pcm16Buffer.length} bytes PCM (16kHz) for ElevenLabs`);
    
    // Step 3: Convert to base64 for ElevenLabs
    const pcmBase64 = pcm16Buffer.toString("base64");
    
    // Step 4: Send to ElevenLabs agent
    console.log(`📤 Sending ${pcm16Buffer.length} bytes PCM (16kHz) to ElevenLabs...`);
    await sendAudioToAgent(sessionId, pcmBase64);
    console.log(`✅ Successfully sent audio to ElevenLabs`);
  } catch (error) {
    console.error("❌ Error processing Acephone media:", error);
    console.error("❌ Error stack:", error.stack);
  }
}

/**
 * Handle Acephone 'stop' event
 */
async function handleAcephoneStop(sessionId) {
  const connection = activeConnections.get(sessionId);
  if (!connection) return;

  console.log("🛑 Acephone call stopped for streamSid:", connection.streamSid);
  
  connection.callEnded = true;
  
  // End ElevenLabs conversation
  if (connection.agentConversation) {
    await endConversation(sessionId);
  }
  
  // Clean up connection
  activeConnections.delete(sessionId);
}

/**
 * Handle Acephone 'dtmf' event
 */
function handleAcephoneDtmf(sessionId, dtmfMessage) {
  console.log("📞 DTMF received:", dtmfMessage.dtmf?.digit);
  console.log("📋 DTMF event metadata:", JSON.stringify(dtmfMessage.dtmf, null, 2));
  // Forward DTMF to agent if needed
}

/**
 * Handle Acephone 'mark' event
 */
function handleAcephoneMark(sessionId, markMessage) {
  console.log("🏷️ Mark received:", markMessage.mark?.name);
  console.log("📋 Mark event metadata:", JSON.stringify(markMessage.mark, null, 2));
}

/**
 * Convert µ-law audio to PCM (ITU-T G.711 standard)
 */
function convertUlawToPcm(ulawBuffer) {
  // µ-law to linear conversion using ITU-T G.711 standard
  const BIAS = 0x84;
  
  // Convert µ-law samples to 16-bit PCM
  const pcmBuffer = Buffer.alloc(ulawBuffer.length * 2);
  
  for (let i = 0; i < ulawBuffer.length; i++) {
    let ulawSample = ~ulawBuffer[i];
    let sign = ulawSample & 0x80;
    let exponent = (ulawSample >> 4) & 0x07;
    let mantissa = ulawSample & 0x0F;
    
    let sample = (mantissa << 3) + BIAS;
    sample <<= exponent;
    
    if (sign) sample = -sample;
    
    // Clamp to 16-bit range
    sample = Math.max(-32768, Math.min(32767, sample));
    
    pcmBuffer.writeInt16LE(sample, i * 2);
  }
  
  return pcmBuffer;
}

/**
 * Convert PCM audio to µ-law
 */
function convertPcmToUlaw(pcmBuffer) {
  // PCM to µ-law conversion
  const ulawBuffer = Buffer.alloc(pcmBuffer.length / 2);
  
  for (let i = 0; i < pcmBuffer.length - 1; i += 2) { // Ensure we don't read beyond buffer
    const pcmSample = pcmBuffer.readInt16LE(i);
    const ulawSample = linearToUlaw(pcmSample);
    const outputIndex = i / 2;
    if (outputIndex < ulawBuffer.length) { // Ensure we don't write beyond buffer
      ulawBuffer[outputIndex] = ulawSample;
    }
  }
  
  return ulawBuffer;
}

/**
 * Convert linear PCM sample to µ-law (ITU-T G.711 standard)
 */
function linearToUlaw(sample) {
  const BIAS = 0x84;
  const CLIP = 8159;
  
  // Get sign and make sample positive
  let sign = (sample < 0) ? 0x80 : 0x00;
  if (sample < 0) sample = -sample;
  
  // Clip sample to maximum value
  sample = Math.min(sample, CLIP);
  sample += BIAS;
  
  // Find exponent
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  
  // Extract mantissa
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  
  // Construct µ-law sample
  let ulawSample = ~(sign | (exponent << 4) | mantissa);
  
  return ulawSample & 0xFF;
}

/**
 * Downsample PCM audio from 16kHz to 8kHz (simple decimation)
 */
function downsamplePcm16to8(pcm16Buffer) {
  // Simple downsampling: take every other sample
  const pcm8Buffer = Buffer.alloc(pcm16Buffer.length / 2);
  
  let outputIndex = 0;
  for (let i = 0; i < pcm16Buffer.length - 1; i += 4) { // 4 bytes = 2 samples at 16-bit
    // Take every other sample (decimation by 2)
    if (outputIndex < pcm8Buffer.length - 1) {
      const sample = pcm16Buffer.readInt16LE(i);
      pcm8Buffer.writeInt16LE(sample, outputIndex);
      outputIndex += 2; // Move by 2 bytes (1 sample)
    }
  }
  
  return pcm8Buffer;
}

/**
 * Upsample PCM audio from 8kHz to 16kHz (simple interpolation)
 */
function upsamplePcm8to16(pcm8Buffer) {
  // Simple upsampling: duplicate each sample
  const pcm16Buffer = Buffer.alloc(pcm8Buffer.length * 2);
  
  let outputIndex = 0;
  for (let i = 0; i < pcm8Buffer.length - 1; i += 2) { // 2 bytes per sample
    const sample = pcm8Buffer.readInt16LE(i);
    
    // Write the sample twice (simple duplication for upsampling)
    if (outputIndex < pcm16Buffer.length - 3) {
      pcm16Buffer.writeInt16LE(sample, outputIndex);
      pcm16Buffer.writeInt16LE(sample, outputIndex + 2);
      outputIndex += 4; // Move by 4 bytes (2 samples)
    }
  }
  
  return pcm16Buffer;
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
        // OUTGOING AUDIO STREAM: ElevenLabs Agent → Knowlarity/Acephone → Caller
        // This is the main audio response from AI agent to caller
        if (agentMessage.type === "agent_audio" && agentMessage.audio) {
          // Check client type from stored connection data
          const isWebClient = connection.clientType === "web_client";
          const isAcephone = connection.clientType === "acephone";

          if (isAcephone) {
            // OUTGOING AUDIO PROCESSING (ElevenLabs → Acephone)
            // PDF Section 3.1: Must send µ-law/8000 base64 encoded, multiples of 160 bytes
            try {
              const pcmBuffer = Buffer.from(agentMessage.audio, "base64");
              console.log(`🔊 OUTGOING: Converting ${pcmBuffer.length} bytes PCM (16kHz) from ElevenLabs`);
              
              // Step 1: Downsample PCM from 16kHz to 8kHz for Acephone
              const downsampledPcm = downsamplePcm16to8(pcmBuffer);
              console.log(`🔄 Downsampled to ${downsampledPcm.length} bytes PCM (8kHz)`);
              
              // Step 2: Ensure even number of bytes for 16-bit samples
              let alignedPcm = downsampledPcm;
              if (downsampledPcm.length % 2 !== 0) {
                console.log(`⚠️ Padding PCM by 1 byte for 16-bit alignment`);
                alignedPcm = Buffer.concat([downsampledPcm, Buffer.alloc(1, 0)]);
              }
              
              // Step 3: Convert PCM (8kHz) to µ-law
              const ulawBuffer = convertPcmToUlaw(alignedPcm);
              console.log(`🎵 Converted to ${ulawBuffer.length} bytes µ-law (8kHz)`);
              
              // Step 4: PDF REQUIREMENT - Payload must be multiples of 160 bytes
              let paddedUlawBuffer = ulawBuffer;
              const remainder = ulawBuffer.length % 160;
              if (remainder !== 0) {
                const paddingNeeded = 160 - remainder;
                console.log(`📏 PDF Requirement: Padding µ-law by ${paddingNeeded} bytes (${ulawBuffer.length} → ${ulawBuffer.length + paddingNeeded})`);
                paddedUlawBuffer = Buffer.concat([ulawBuffer, Buffer.alloc(paddingNeeded, 0xFF)]);
              }
              
              // Step 5: Encode to base64 for transmission
              const ulawBase64 = paddedUlawBuffer.toString("base64");
              
              // Step 6: Create media event per PDF Section 3.1 (Events Received from Vendor)
              const mediaEvent = {
                event: "media",
                streamSid: connection.acephoneStreamSid || connection.streamSid,
                media: {
                  payload: ulawBase64, // µ-law/8000 audio in base64
                  chunk: connection.outboundChunkNumber
                }
              };
              
              console.log(`📤 Sending µ-law audio chunk ${connection.outboundChunkNumber} (${paddedUlawBuffer.length} bytes)`);
              console.log("📋 Final media event structure:", JSON.stringify(mediaEvent, null, 2));
              
              // Step 7: Send to Acephone
              if (connection.websocket.readyState === WebSocket.OPEN) {
                connection.websocket.send(JSON.stringify(mediaEvent));
                console.log("✅ µ-law audio sent to Acephone successfully");
              } else {
                console.error("❌ WebSocket not open, cannot send media");
              }
              
              // Increment chunk number for next audio chunk
              connection.outboundChunkNumber++;

              // Mark that agent has spoken (for first audio chunk)
              if (!connection.agentHasSpoken) {
                connection.agentHasSpoken = true;
                console.log("🎤 Agent has now spoken - ready to process user audio");
              }

            } catch (sendError) {
              console.error("❌ Failed to send Acephone audio:", sendError.message);
              console.error("❌ Send error stack:", sendError.stack);
            }
          } else if (!isWebClient) {
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

        // CALL END: Close Knowlarity/Acephone WebSocket when ElevenLabs conversation ends
        if (agentMessage.type === "call_end") {
          console.log("📞 Ending call for session:", sessionId);

          // Mark session as ended to prevent further processing
          connection.callEnded = true;

          // Send call end signal based on client type
          if (connection.clientType === "acephone") {
            // Send 'clear' event to Acephone to end the call
            try {
              sendAcephoneEvent(connection.websocket, sessionId, {
                event: "clear"
              });
            } catch (error) {
              console.log("📞 Error sending Acephone clear event:", error.message);
            }
          } else if (
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
  const amplifiedAudioBuffer = amplifyAudioVolume(audioBuffer, 2.5); // 2.5x amplification - clean and artifact-free

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
