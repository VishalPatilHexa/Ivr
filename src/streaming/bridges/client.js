/**
 * ===============================================================================
 * CLIENT COMMUNICATION BRIDGE
 * ===============================================================================
 *
 * Manages communication bridge between ElevenLabs and WebSocket clients
 */

// CRITICAL CALLBACK STORAGE: This stores the callback function from websocketHandler.js
let messageForwardingHandler = null;

/**
 * Forward messages to the calling system
 *
 * CRITICAL BRIDGE FUNCTION: This is THE CONNECTION POINT between ElevenLabs and WebSocket
 *
 * HOW THE BRIDGE WORKS:
 * 1. ElevenLabs agent processes audio/text and calls this function
 * 2. This function executes the callback stored in 'messageForwardingHandler'
 * 3. The callback (from setupAudioStreaming) sends the message to Knowlarity WebSocket
 * 4. Knowlarity forwards it to the caller
 *
 * FLOW: ElevenLabs → THIS FUNCTION → CALLBACK → WebSocket → Knowlarity → Caller
 */
function forwardToClient(sessionId, messageToForward) {
  // CALLBACK EXECUTION: Execute the callback registered by websocketHandler
  if (messageForwardingHandler) {
    // THIS IS THE BRIDGE: Calls the callback from setupAudioStreaming()
    messageForwardingHandler(sessionId, messageToForward);
  }
}

/**
 * Set handler for messages to be forwarded to calling system
 *
 * CALLBACK REGISTRATION POINT: This is where the WebSocket handler registers its callback
 *
 * REGISTRATION FLOW:
 * 1. websocketHandler.js calls setupAudioStreaming()
 * 2. setupAudioStreaming() calls THIS FUNCTION with a callback
 * 3. The callback gets STORED in 'messageForwardingHandler'
 * 4. Later, when ElevenLabs has responses, forwardToClient() EXECUTES this callback
 *
 * This creates the communication bridge: ElevenLabs → WebSocket → Caller
 */
function setClientMessageHandler(messageHandler) {
  // CALLBACK STORAGE: Store the callback from websocketHandler for later execution
  messageForwardingHandler = messageHandler;
}

module.exports = {
  forwardToClient,
  setClientMessageHandler,
};
