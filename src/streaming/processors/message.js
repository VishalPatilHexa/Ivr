/**
 * ===============================================================================
 * MESSAGE PROCESSING
 * ===============================================================================
 *
 * Processes all incoming messages from ElevenLabs
 */

const WebSocket = require("ws");
const clientBridge = require("../bridges/client");
const conversationManager = require("../../core/managers/conversation");

/**
 * Process all incoming messages from ElevenLabs
 */
async function handleElevenLabsMessage(sessionId, messageData) {
  try {
    const parsedMessage = JSON.parse(messageData);
    const conversationSession =
      conversationManager.activeConversations.get(sessionId);

    if (!conversationSession) {
      return;
    }

    switch (parsedMessage.type) {
      case "user_transcript":
        handleUserTranscript(sessionId, parsedMessage);
        break;

      case "agent_response":
        handleAgentTextResponse(sessionId, parsedMessage);
        break;

      case "agent_response_audio_delta":
        handleAgentAudioChunk(sessionId, parsedMessage);
        break;

      case "audio":
        handleDirectAudio(sessionId, parsedMessage);
        break;

      case "agent_response_audio_end":
        handleAgentAudioEnd(sessionId);
        break;

      case "conversation_end":
        handleConversationEnd(sessionId);
        break;

      case "ping":
        handlePing(parsedMessage, conversationSession);
        break;

      case "conversation_initiation_metadata":
        handleConversationReady(sessionId, parsedMessage, conversationSession);
        break;

      case "interruption":
        handleInterruption(sessionId, parsedMessage);
        break;

      case "agent_response_correction":
        handleAgentResponseCorrection(sessionId, parsedMessage);
        break;

      default:
        // Unknown message type
        break;
    }
  } catch (error) {
    console.error("❌ Error handling ElevenLabs message:", error);
  }
}

/**
 * Handle user speech transcript
 */
function handleUserTranscript(sessionId, transcriptMessage) {
  const userTranscript =
    transcriptMessage.user_transcript_event?.user_transcript ||
    transcriptMessage.user_transcript;

  clientBridge.forwardToClient(sessionId, {
    type: "user_transcript",
    text: userTranscript,
  });
}

/**
 * Handle agent text response
 */
function handleAgentTextResponse(sessionId, responseMessage) {
  const agentResponseText =
    responseMessage.agent_response_event?.agent_response ||
    responseMessage.agent_response?.text ||
    responseMessage.text;

  if (agentResponseText) {
    clientBridge.forwardToClient(sessionId, {
      type: "agent_response",
      text: agentResponseText,
    });
  }
}

/**
 * Handle streaming audio chunks from agent
 */
function handleAgentAudioChunk(sessionId, audioMessage) {
  if (audioMessage.agent_response_audio_delta_event?.delta_audio_base_64) {
    clientBridge.forwardToClient(sessionId, {
      type: "agent_audio",
      audio: audioMessage.agent_response_audio_delta_event.delta_audio_base_64,
    });
  }
}

/**
 * Handle direct audio messages
 */
function handleDirectAudio(sessionId, directAudioMessage) {
  if (directAudioMessage.audio_event?.audio_base_64) {
    clientBridge.forwardToClient(sessionId, {
      type: "agent_audio",
      audio: directAudioMessage.audio_event.audio_base_64,
    });
  }
}

/**
 * Handle agent finished speaking
 */
function handleAgentAudioEnd(sessionId) {
  clientBridge.forwardToClient(sessionId, {
    type: "agent_audio_end",
  });
}

/**
 * Handle conversation end
 */
function handleConversationEnd(sessionId) {
  // Clean up the conversation
  conversationManager.endConversation(sessionId);

  // Signal the client (Knowlarity) to close the call
  clientBridge.forwardToClient(sessionId, {
    type: "call_end",
    message: "Call completed successfully",
  });
}

/**
 * Handle ping/pong for connection keepalive
 */
function handlePing(pingMessage, conversationSession) {
  if (conversationSession?.agentWebSocket) {
    const pongResponse = {
      pong_event: {
        event_id: pingMessage.ping_event?.event_id,
      },
    };
    conversationSession.agentWebSocket.send(JSON.stringify(pongResponse));
  }
}

/**
 * Handle conversation ready state
 */
function handleConversationReady(sessionId, readyMessage, conversationSession) {
  // Store conversation metadata
  if (conversationSession) {
    conversationSession.conversationId =
      readyMessage.conversation_initiation_metadata_event?.conversation_id;
    conversationSession.audioFormat =
      readyMessage.conversation_initiation_metadata_event?.agent_output_audio_format;
  }

  // Trigger initial agent response for phone calls
  setTimeout(() => {
    if (conversationSession?.agentWebSocket?.readyState === WebSocket.OPEN) {
      // For phone calls, we need the agent to speak first
      // Send a minimal audio chunk to trigger agent response
      const silentAudio = Buffer.alloc(320, 0).toString("base64"); // 20ms of silence at 16kHz
      conversationSession.agentWebSocket.send(
        JSON.stringify({
          user_audio_chunk: silentAudio,
        })
      );
    }
  }, 1000);

  clientBridge.forwardToClient(sessionId, {
    type: "agent_ready",
    message: "Agent is ready to start conversation",
  });
}

/**
 * Handle user interruption of agent speech
 */
function handleInterruption(sessionId) {
  clientBridge.forwardToClient(sessionId, {
    type: "agent_interrupted",
    message: "Agent speech was interrupted by user",
  });
}

/**
 * Handle agent response correction
 */
function handleAgentResponseCorrection(sessionId, correctionMessage) {
  if (correctionMessage.agent_response_correction_event?.corrected_response) {
    clientBridge.forwardToClient(sessionId, {
      type: "agent_response_correction",
      text: correctionMessage.agent_response_correction_event
        .corrected_response,
    });
  }
}

module.exports = {
  handleElevenLabsMessage,
  handleConversationEnd,
};
