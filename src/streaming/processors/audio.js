/**
 * ===============================================================================
 * AUDIO COMMUNICATION
 * ===============================================================================
 * 
 * Handles audio streaming to/from ElevenLabs agent
 */

const websocketManager = require('../managers/websocket');

/**
 * Send audio chunk to ElevenLabs agent
 * 
 * INCOMING AUDIO PROCESSING: Sends caller's audio to ElevenLabs for AI processing
 * AUDIO FLOW: Caller → Knowlarity → WebSocket → THIS FUNCTION → ElevenLabs Agent
 */
async function sendAudioToAgent(sessionId, audioData) {
  try {
    // AUDIO MESSAGE FORMATTING: Package audio for ElevenLabs API
    const audioMessage = {
      user_audio_chunk: audioData, // Base64 encoded audio from caller
    };

    // SEND TO AGENT: Forward caller's audio to ElevenLabs for processing
    await websocketManager.sendToElevenLabs(sessionId, audioMessage);
  } catch (error) {
    console.error("❌ Error sending audio to agent:", error);
  }
}

/**
 * Send text message to ElevenLabs agent
 */
async function sendTextToAgent(sessionId, textContent) {
  try {
    const textMessage = {
      user_text: textContent,
    };

    await websocketManager.sendToElevenLabs(sessionId, textMessage);
  } catch (error) {
    console.error("❌ Error sending text to agent:", error);
  }
}

module.exports = {
  sendAudioToAgent,
  sendTextToAgent
};