const { getConnection } = require('../../core/websocket/connectionManager');
const { createPlayAudioMessage } = require('../../core/audio/audioProcessor');

/**
 * Send audio to Knowlarity caller
 */
function sendAudioToCaller(sessionId, base64AudioData) {
  const connection = getConnection(sessionId);
  
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    console.log('⚠️ Cannot send audio - WebSocket connection not available for session:', sessionId);
    return false;
  }

  try {
    const audioMessage = createPlayAudioMessage(base64AudioData);
    const messageJson = JSON.stringify(audioMessage);
    
    connection.websocket.send(messageJson);
    console.log(`📤 Sent audio to Knowlarity (${base64AudioData.length} chars base64)`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send audio to Knowlarity:', error.message);
    return false;
  }
}

/**
 * Transfer call to another number
 */
function transferCall(sessionId, phoneNumber) {
  const connection = getConnection(sessionId);
  
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    console.error('❌ Cannot transfer call - connection not available for session:', sessionId);
    return false;
  }

  try {
    const transferMessage = {
      type: "transfer",
      data: { textContent: phoneNumber }
    };
    
    connection.websocket.send(JSON.stringify(transferMessage));
    console.log(`📞 Transferring call ${sessionId} to ${phoneNumber}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to transfer call:', error.message);
    return false;
  }
}

/**
 * Terminate call stream
 */
function terminateStream(sessionId) {
  const connection = getConnection(sessionId);
  
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    console.error('❌ Cannot terminate stream - connection not available for session:', sessionId);
    return false;
  }

  try {
    const disconnectMessage = { type: "disconnect" };
    
    connection.websocket.send(JSON.stringify(disconnectMessage));
    console.log(`📞 Terminating stream for call ${sessionId}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to terminate stream:', error.message);
    return false;
  }
}

/**
 * Stop audio playback
 */
function killAudio(sessionId) {
  const connection = getConnection(sessionId);
  
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    console.error('❌ Cannot kill audio - connection not available for session:', sessionId);
    return false;
  }

  try {
    const killAudioMessage = { type: "killAudio" };
    
    connection.websocket.send(JSON.stringify(killAudioMessage));
    console.log(`📞 Killing audio for call ${sessionId}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to kill audio:', error.message);
    return false;
  }
}

/**
 * Handle control messages from Knowlarity
 */
function handleControlMessage(messageData, sessionId) {
  try {
    const controlData = JSON.parse(messageData);
    console.log(`📋 Control message: ${controlData.type} for session: ${sessionId}`);

    switch (controlData.type) {
      case "call_start":
        console.log(`📞 Call started for session: ${sessionId}`);
        break;

      case "call_end":
        console.log(`📞 Call ended for session: ${sessionId}`);
        break;

      case "dtmf":
        console.log(`📞 DTMF received: ${controlData.digit} for session: ${sessionId}`);
        break;

      default:
        console.log(`📋 Unknown control message type: ${controlData.type}`);
    }

    return { success: true, type: controlData.type };

  } catch (error) {
    console.log('⚠️ Non-JSON control message received for session:', sessionId);
    return { success: false, error: 'Invalid JSON' };
  }
}

module.exports = {
  sendAudioToCaller,
  transferCall,
  terminateStream,
  killAudio,
  handleControlMessage,
};