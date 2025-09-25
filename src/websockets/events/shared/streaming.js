/**
 * ===============================================================================
 * SHARED AUDIO STREAMING SETUP
 * ===============================================================================
 *
 * Common streaming functions for bidirectional audio between providers and ElevenLabs
 */

const WebSocket = require("ws");
const Logger = require("../../../utils/logger");
const audioUtils = require("./audio");

// Import ElevenLabs agent service
const elevenLabsAgentService = require("../../../streaming/adapters/elevenlabs");

/**
 * Setup bidirectional audio streaming between ElevenLabs and provider
 *
 * CRITICAL CONNECTION POINT: This function creates the bridge between:
 * - ElevenLabs Agent Service (processes AI responses)
 * - WebSocket Handler (manages caller connections)
 */
function setupAudioStreaming(sessionId, activeConnections) {
  Logger.debug("🎵 Setting up audio streaming", { sessionId });

  // Register callback with ElevenLabs agent service
  elevenLabsAgentService.setClientMessageHandler((currentSessionId, agentMessage) => {
    // Only process messages for this specific call session
    if (currentSessionId === sessionId) {
      const connection = activeConnections.get(sessionId);

      if (connection?.websocket?.readyState === WebSocket.OPEN) {
        handleAgentMessage(connection, agentMessage, sessionId);
      }
    }
  });
}

/**
 * Handle messages from ElevenLabs agent
 */
function handleAgentMessage(connection, agentMessage, sessionId) {
  const { clientType, websocket } = connection;

  switch (agentMessage.type) {
    case "agent_audio":
      if (agentMessage.audio) {
        handleAgentAudio(connection, agentMessage.audio);
      }
      break;

    case "agent_response":
      if (agentMessage.text) {
        Logger.debug("🤖 Agent response", { sessionId, text: agentMessage.text });
      }
      break;

    case "agent_audio_end":
      Logger.debug("🔚 Agent finished speaking", { sessionId });
      break;

    case "call_end":
      handleCallEnd(connection, sessionId);
      break;

    default:
      Logger.debug("📨 Unknown agent message type", { 
        type: agentMessage.type, 
        sessionId 
      });
  }
}

/**
 * Handle agent audio based on client type
 */
function handleAgentAudio(connection, audioBase64) {
  const { clientType, websocket } = connection;

  try {
    if (clientType === "acephone") {
      sendAudioToAcephone(connection, audioBase64);
    } else if (clientType === "web_client") {
      sendAudioToWebClient(connection, audioBase64);
    } else {
      sendAudioToKnowlarity(connection, audioBase64);
    }
  } catch (error) {
    Logger.error("❌ Failed to send agent audio", { 
      clientType, 
      error: error.message 
    });
  }
}

/**
 * Send audio to Acephone (requires µ-law conversion)
 */
function sendAudioToAcephone(connection, audioBase64) {
  const pcmBuffer = Buffer.from(audioBase64, "base64");
  
  // Convert PCM 16kHz to µ-law 8kHz for Acephone
  const downsampledPcm = audioUtils.downsamplePcm16to8(pcmBuffer);
  
  // Ensure even number of bytes for 16-bit samples
  let alignedPcm = downsampledPcm;
  if (downsampledPcm.length % 2 !== 0) {
    alignedPcm = Buffer.concat([downsampledPcm, Buffer.alloc(1, 0)]);
  }
  
  // Convert to µ-law
  const ulawBuffer = audioUtils.convertPcmToUlaw(alignedPcm);
  
  // Pad to multiples of 160 bytes (Acephone requirement)
  let paddedUlawBuffer = ulawBuffer;
  const remainder = ulawBuffer.length % 160;
  if (remainder !== 0) {
    const paddingNeeded = 160 - remainder;
    paddedUlawBuffer = Buffer.concat([
      ulawBuffer,
      Buffer.alloc(paddingNeeded, 0xff),
    ]);
  }
  
  // Send as Acephone media event
  const mediaEvent = {
    event: "media",
    streamSid: connection.acephoneStreamSid || connection.streamSid,
    media: {
      payload: paddedUlawBuffer.toString("base64"),
      chunk: connection.outboundChunkNumber || 1,
    },
  };
  
  connection.websocket.send(JSON.stringify(mediaEvent));
  connection.outboundChunkNumber = (connection.outboundChunkNumber || 1) + 1;
  
  // Mark agent as having spoken
  if (!connection.agentHasSpoken) {
    connection.agentHasSpoken = true;
    Logger.debug("🎤 Agent has spoken - ready for user audio", {
      sessionId: connection.sessionId
    });
  }
}

/**
 * Send audio to Knowlarity (PCM format)
 */
function sendAudioToKnowlarity(connection, audioBase64) {
  const knowlarityAudioMessage = {
    type: "playAudio",
    data: {
      audioContentType: "raw",
      sampleRate: 16000,
      audioContent: audioBase64,
    },
  };
  
  connection.websocket.send(JSON.stringify(knowlarityAudioMessage));
}

/**
 * Send audio to web client (binary format)
 */
function sendAudioToWebClient(connection, audioBase64) {
  const audioBuffer = Buffer.from(audioBase64, "base64");
  connection.websocket.send(audioBuffer);
}

/**
 * Handle call end from agent
 */
function handleCallEnd(connection, sessionId) {
  Logger.info("📞 Agent initiated call end", { sessionId });
  
  connection.callEnded = true;
  
  // Send call end signal based on client type
  if (connection.clientType === "acephone") {
    sendAcephoneEvent(connection.websocket, sessionId, { event: "clear" });
  } else {
    const endMessage = {
      type: "call_end",
      message: "Call completed successfully",
    };
    connection.websocket.send(JSON.stringify(endMessage));
  }
  
  // Close WebSocket
  if (connection.websocket?.readyState === WebSocket.OPEN) {
    connection.websocket.close(1000, "Call completed");
  }
}

/**
 * Send audio to ElevenLabs agent
 */
async function sendAudioToAgent(sessionId, audioBase64) {
  try {
    await elevenLabsAgentService.sendAudioToAgent(sessionId, audioBase64);
  } catch (error) {
    Logger.error("❌ Failed to send audio to agent", { sessionId, error });
    throw error;
  }
}

/**
 * End conversation with ElevenLabs
 */
async function endConversation(sessionId) {
  try {
    await elevenLabsAgentService.endConversation(sessionId);
    Logger.info("✅ Ended conversation with agent", { sessionId });
  } catch (error) {
    Logger.error("❌ Failed to end conversation", { sessionId, error });
  }
}

/**
 * Send event to Acephone with proper structure
 */
function sendAcephoneEvent(websocket, sessionId, eventData) {
  const message = {
    event: eventData.event,
    sequenceNumber: Math.floor(Math.random() * 1000),
    streamSid: sessionId,
    ...eventData,
  };
  
  if (websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify(message));
    Logger.debug(`📤 Sent Acephone event: ${eventData.event}`);
  }
}

module.exports = {
  setupAudioStreaming,
  sendAudioToAgent,
  endConversation,
  sendAcephoneEvent,
};