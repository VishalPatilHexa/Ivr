/**
 * ===============================================================================
 * ACEPHONE STREAM HANDLER
 * ===============================================================================
 *
 * Handles Acephone WebSocket connections and bi-directional audio streaming
 * Implements the full Acephone WebSocket protocol for real-time voice communication
 */

const Logger = require("../../../utils/logger");
const sessionUtils = require("../shared/session");
const messageHandlers = require("../shared/messageHandlers");
const audioUtils = require("../shared/audio");
const agentInitializer = require("../shared/agentInitializer");
const elevenLabsAdapter = require("../../../streaming/adapters/elevenlabs");
const metadataProcessor = require("./metadata");
const lifecycleManager = require("./lifecycle");

// Track sequence numbers for outgoing messages per session
const sequenceNumbers = new Map();

// Track if ElevenLabs handler is already setup (singleton pattern)
let isElevenLabsHandlerSetup = false;

/**
 * Handle Acephone WebSocket connection
 */
function handleConnection(websocket, urlPath, activeConnections) {
  // Use temporary sessionId until we get the real one from customParameters
  const tempSessionId = `acephone_temp_${Date.now()}`;
  const clientType = "acephone";

  Logger.info("🚀 Acephone handler called (basic implementation)", {
    tempSessionId,
  });

  try {
    // Store connection with temporary ID
    sessionUtils.storeConnection(
      tempSessionId,
      websocket,
      clientType,
      activeConnections
    );

    // Setup message handling - will update sessionId when 'start' event is received
    setupMessageHandling(websocket, tempSessionId, activeConnections);

    // Setup ElevenLabs audio response handler
    setupElevenLabsResponseHandler(activeConnections);

    // Note: Lifecycle handlers will be set up after we get the real sessionId in 'start' event

    Logger.info("✅ Acephone handler setup complete", { tempSessionId });
  } catch (error) {
    Logger.error("❌ Failed to setup Acephone connection", {
      tempSessionId,
      error,
    });
    websocket.close(1011, "Failed to initialize connection");
  }
}

/**
 * Setup message handling for Acephone connection
 */
function setupMessageHandling(websocket, sessionId, activeConnections) {
  websocket.on("message", async (message) => {
    try {
      // Parse message using reusable utility
      const parsed = messageHandlers.parseMessage(message);

      if (parsed.type === "json" || parsed.type === "text") {
        const data =
          parsed.type === "json" ? parsed.data : JSON.parse(parsed.data);

        Logger.debug("📨 Acephone message received", {
          sessionId,
          event: data.event,
          sequenceNumber: data.sequenceNumber,
        });

        // Define custom handlers for Acephone events
        const handlers = {
          connected: async (data, sid) => {
            Logger.info("✅ Acephone handshake complete", { sessionId: sid });
          },

          start: async (data, sid) => {
            // Extract metadata using metadata processor
            const { success, metadata } = metadataProcessor.extractMetadata(data.start);

            if (!success || !metadata.sessionId) {
              Logger.warn("⚠️ Failed to extract metadata from start event", {
                tempSessionId: sid,
              });
              return;
            }

            const realSessionId = metadata.sessionId;
            const streamSid = metadata.streamSid;

            Logger.info("🔄 Updating sessionId from customParameters", {
              oldSessionId: sid,
              newSessionId: realSessionId,
              streamSid,
            });

            // Get the connection data
            const connectionData = activeConnections.get(sid);

            if (connectionData) {
              // Remove old temp sessionId
              activeConnections.delete(sid);

              // Store with real sessionId and extracted metadata
              activeConnections.set(realSessionId, {
                ...connectionData,
                ...metadata, // Spread all metadata fields
                audioChunkCounter: 0, // Track media chunks
              });

              // Initialize sequence number for this session
              sequenceNumbers.set(realSessionId, 0);

              // Setup connection lifecycle with real sessionId
              lifecycleManager.setupConnectionLifecycle(
                websocket,
                realSessionId,
                activeConnections
              );

              // Update the sessionId variable for subsequent handlers
              sessionId = realSessionId;
            }

            // Initialize ElevenLabs agent using shared initializer
            if (metadata.agentId) {
              await initializeAgentForAcephone(
                realSessionId,
                data.start,
                activeConnections
              );
            }
          },

          media: async (data, sid) => {
            // Handle incoming audio from Acephone
            const connectionData = activeConnections.get(sid);
            if (!connectionData) {
              Logger.error("❌ Connection not found for media", {
                sessionId: sid,
              });
              return;
            }

            connectionData.audioChunkCounter =
              (connectionData.audioChunkCounter || 0) + 1;

            const base64Audio = data.media?.payload;
            if (!base64Audio) {
              Logger.warn("⚠️ No audio payload in media message", {
                sessionId: sid,
              });
              return;
            }

            Logger.debug("🎵 Acephone media received", {
              sessionId: sid,
              chunk: data.media?.chunk,
              timestamp: data.media?.timestamp,
              payloadSize: base64Audio.length,
            });

            try {
              // Step 1: Decode base64 µ-law audio (8kHz, 8-bit)
              const ulawBuffer = Buffer.from(base64Audio, "base64");

              // Step 2: Convert µ-law to PCM (8kHz, 16-bit)
              const pcm8Buffer = audioUtils.convertUlawToPcm(ulawBuffer);

              // Step 3: Upsample from 8kHz to 16kHz for ElevenLabs
              const pcm16Buffer = audioUtils.upsamplePcm8to16(pcm8Buffer);

              // Step 4: Encode as base64 and send to ElevenLabs
              const pcm16Base64 = pcm16Buffer.toString("base64");
              await elevenLabsAdapter.sendAudioToAgent(sid, pcm16Base64);
            } catch (error) {
              Logger.error("❌ Error processing incoming audio", {
                sessionId: sid,
                error: error.message,
              });
            }
          },

          dtmf: async (data, sid) => {
            // Handle DTMF (touch-tone) input
            Logger.info("📞 DTMF digit received", {
              sessionId: sid,
              digit: data.dtmf?.digit,
              streamSid: data.streamSid,
            });

            // TODO: Handle DTMF input (e.g., menu navigation, number entry)
            // await handleDTMFInput(sid, data.dtmf.digit);
          },

          mark: async (data, sid) => {
            // Handle mark event (audio playback complete)
            Logger.info("✓ Audio mark received", {
              sessionId: sid,
              markName: data.mark?.name,
              streamSid: data.streamSid,
            });

            // TODO: Handle audio playback completion
            // This indicates that audio we sent has finished playing
            // await handleAudioPlaybackComplete(sid, data.mark.name);
          },

          stop: async (data, sid) => {
            Logger.info("🛑 Acephone call stopped", {
              sessionId: sid,
              reason: data.stop?.reason,
              callSid: data.stop?.callSid,
            });

            // Clean up sequence number tracking
            sequenceNumbers.delete(sid);

            handleCallEnd(sid, activeConnections);
          },
        };

        // Handle based on event field
        if (data.event && handlers[data.event]) {
          await handlers[data.event](data, sessionId);
        } else {
          Logger.debug("❓ Unknown Acephone event", {
            sessionId,
            event: data.event,
          });
        }
      } else if (parsed.type === "binary") {
        // Handle binary audio data when Acephone audio streaming is implemented
        Logger.debug("🎵 Acephone binary audio received", { sessionId });
        // TODO: Implement audio handling when needed
      }
    } catch (error) {
      Logger.error("❌ Error processing Acephone message", {
        sessionId,
        error: error.message,
      });
    }
  });
}

/**
 * Handle call end
 */
async function handleCallEnd(sessionId, activeConnections) {
  // End ElevenLabs conversation
  try {
    await elevenLabsAdapter.endConversation(sessionId);
    Logger.info("✅ ElevenLabs conversation ended", { sessionId });
  } catch (error) {
    Logger.error("❌ Error ending ElevenLabs conversation", {
      sessionId,
      error: error.message,
    });
  }

  // Mark call as ended using reusable utility
  sessionUtils.markCallEnded(sessionId, activeConnections);

  // Clean up sequence number tracking
  sequenceNumbers.delete(sessionId);

  // Remove connection using reusable utility
  sessionUtils.removeConnection(sessionId, activeConnections);

  Logger.info("📞 Acephone call ended", { sessionId });
}

/**
 * Initialize ElevenLabs agent conversation for Acephone
 * Uses agentInitializer with custom metadata extractors
 */
async function initializeAgentForAcephone(sessionId, startData, activeConnections) {
  // Custom agentId extractor for Acephone metadata structure
  // Note: agentInitializer will pass the full metadata to this function
  const extractAgentId = (metadata) => {
    // The metadata here is the ElevenLabs format: {metadata: {metadata: {agentId, ...}}}
    // Extract from nested structure
    return metadataProcessor.safeExtract(
      metadata,
      "metadata.metadata.agentId",
      "metadata.agentId",
      "agentId"
    );
  };

  // Custom extractors not needed for Acephone (no ivrCallId)
  const extractCallId = () => null;

  // Build ElevenLabs metadata structure
  const elevenLabsMetadata = metadataProcessor.buildElevenLabsMetadata(startData);

  // Use shared agent initializer
  await agentInitializer.initializeAgent(
    sessionId,
    elevenLabsMetadata,
    activeConnections,
    extractAgentId,
    extractCallId
  );
}

/**
 * Get next sequence number for a session
 */
function getNextSequenceNumber(sessionId) {
  const current = sequenceNumbers.get(sessionId) || 0;
  const next = current + 1;
  sequenceNumbers.set(sessionId, next);
  return next;
}

/**
 * Setup handler for ElevenLabs audio responses
 */
function setupElevenLabsResponseHandler(activeConnections) {
  // Only setup once (singleton pattern)
  if (isElevenLabsHandlerSetup) {
    return;
  }
  isElevenLabsHandlerSetup = true;

  // Register callback to receive audio from ElevenLabs
  elevenLabsAdapter.setClientMessageHandler((sessionId, message) => {
    try {
      const connectionData = activeConnections.get(sessionId);
      if (!connectionData || !connectionData.websocket) {
        Logger.warn("⚠️ Connection not found for ElevenLabs response", {
          sessionId,
        });
        return;
      }

      // Handle different message types from ElevenLabs
      switch (message.type) {
        case "agent_audio":
          // ElevenLabs sends PCM 16kHz audio - need to convert to µ-law 8kHz for Acephone
          handleElevenLabsAudio(sessionId, message.audio, activeConnections);
          break;

        case "agent_audio_end":
          Logger.debug("🔚 Agent finished speaking", { sessionId });
          break;

        case "agent_interrupted":
          // Clear Acephone audio buffer when agent is interrupted
          sendClear(sessionId, activeConnections);
          break;

        case "call_end":
          // ElevenLabs ended the conversation - close Acephone connection
          Logger.info("📞 ElevenLabs ended conversation, closing Acephone call", { sessionId });
          if (connectionData.websocket) {
            connectionData.websocket.close(1000, "Conversation ended by agent");
          }
          break;

        default:
          Logger.debug("📩 Other ElevenLabs message", {
            sessionId,
            type: message.type,
          });
      }
    } catch (error) {
      Logger.error("❌ Error handling ElevenLabs response", {
        sessionId,
        error: error.message,
      });
    }
  });
}

/**
 * Handle audio from ElevenLabs and send to Acephone
 */
function handleElevenLabsAudio(sessionId, pcm16Base64, activeConnections) {
  try {
    // Step 1: Decode base64 PCM audio (16kHz, 16-bit)
    const pcm16Buffer = Buffer.from(pcm16Base64, "base64");

    // Step 2: Downsample from 16kHz to 8kHz for Acephone
    const pcm8Buffer = audioUtils.downsamplePcm16to8(pcm16Buffer);

    // Step 3: Convert PCM to µ-law
    const ulawBuffer = audioUtils.convertPcmToUlaw(pcm8Buffer);

    // Step 4: Encode as base64 and send to Acephone
    const ulawBase64 = ulawBuffer.toString("base64");
    sendMedia(sessionId, ulawBase64, activeConnections);

    Logger.info("✅ Audio sent to Acephone", {
      sessionId,
      inputSize: pcm16Buffer.length,
      outputSize: ulawBuffer.length,
    });
  } catch (error) {
    Logger.error("❌ Error converting audio for Acephone", {
      sessionId,
      error: error.message,
    });
  }
}

/**
 * Send media (audio) to Acephone
 * @param {string} sessionId - The session ID
 * @param {string} base64Audio - Base64 encoded mulaw/8000 audio
 * @param {Map} activeConnections - Active connections map
 */
function sendMedia(sessionId, base64Audio, activeConnections) {
  const connectionData = activeConnections.get(sessionId);
  if (!connectionData || !connectionData.websocket) {
    Logger.error("❌ Cannot send media: connection not found", { sessionId });
    return;
  }

  const chunkNumber = (connectionData.audioChunkCounter || 0) + 1;
  connectionData.audioChunkCounter = chunkNumber;

  const message = {
    event: "media",
    streamSid: connectionData.streamSid,
    media: {
      payload: base64Audio,
      chunk: chunkNumber,
    },
  };

  try {
    connectionData.websocket.send(JSON.stringify(message));
    Logger.info("📤 Media sent to Acephone", {
      sessionId,
      streamSid: connectionData.streamSid,
      chunk: chunkNumber,
      payloadSize: base64Audio.length,
    });
  } catch (error) {
    Logger.error("❌ Failed to send media", {
      sessionId,
      error: error.message,
    });
  }
}

/**
 * Send mark message to Acephone
 * @param {string} sessionId - The session ID
 * @param {string} markName - Label to identify this mark
 * @param {Map} activeConnections - Active connections map
 */
function sendMark(sessionId, markName, activeConnections) {
  const connectionData = activeConnections.get(sessionId);
  if (!connectionData || !connectionData.websocket) {
    Logger.error("❌ Cannot send mark: connection not found", { sessionId });
    return;
  }

  const message = {
    event: "mark",
    streamSid: connectionData.streamSid,
    mark: {
      name: markName,
    },
  };

  try {
    connectionData.websocket.send(JSON.stringify(message));
    Logger.debug("📤 Mark sent to Acephone", { sessionId, markName });
  } catch (error) {
    Logger.error("❌ Failed to send mark", { sessionId, error: error.message });
  }
}

/**
 * Send clear message to Acephone (interrupt buffered audio)
 * @param {string} sessionId - The session ID
 * @param {Map} activeConnections - Active connections map
 */
function sendClear(sessionId, activeConnections) {
  const connectionData = activeConnections.get(sessionId);
  if (!connectionData || !connectionData.websocket) {
    Logger.error("❌ Cannot send clear: connection not found", { sessionId });
    return;
  }

  const message = {
    event: "clear",
    streamSid: connectionData.streamSid,
  };

  try {
    connectionData.websocket.send(JSON.stringify(message));
    Logger.info("📤 Clear sent to Acephone (interrupting audio)", {
      sessionId,
    });
  } catch (error) {
    Logger.error("❌ Failed to send clear", {
      sessionId,
      error: error.message,
    });
  }
}

module.exports = {
  handleConnection,
  sendMedia,
  sendMark,
  sendClear,
};
