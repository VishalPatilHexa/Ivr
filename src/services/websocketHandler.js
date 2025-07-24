const WebSocket = require("ws");

// Store active connections
const knowlarityConnections = new Map();

// Initialize WebSocket handler with dependencies
let elevenLabsAgent = null;
let outboundCallManager = null;

function initializeWebSocketHandler(elevenLabsAgentInstance, outboundCallManagerInstance) {
  elevenLabsAgent = elevenLabsAgentInstance;
  outboundCallManager = outboundCallManagerInstance;
}

function handleConnection(ws, req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Check if this is a Knowlarity stream connection
  if (pathname.startsWith('/knowlarity-stream/')) {
    handleKnowlarityStream(ws, pathname);
    return;
  }
  
  // Unknown WebSocket connection
  console.log("🔗 Unknown WebSocket connection, closing");
  ws.close(1008, 'Unknown connection type');
}

function handleKnowlarityStream(ws, pathname) {
  const callSessionId = pathname.split('/')[2];
  console.log("📞 New Knowlarity call stream connection for session:", callSessionId);
  
  // Store the Knowlarity connection with control methods
  knowlarityConnections.set(callSessionId, {
    ws,
    transferCall: null,
    terminateStream: null
  });
  
  // Get call session details
  let callSession = getCallSession(callSessionId);
  if (!callSession) {
    console.log('⚠️ Call session not found, creating temporary session for external call:', callSessionId);
    // Create temporary session for external calls (like Gupshup)
    callSession = {
      sessionId: callSessionId,
      patientData: {
        name: 'External Call (Gupshup)',
        phoneNumber: 'Unknown',
        treatmentType: 'general consultation'
      },
      status: 'external_connection',
      createdAt: new Date(),
      isExternal: true
    };
    console.log('✅ Temporary session created for:', callSessionId);
  }
  
  // Update call status to connected
  handleCallStatusUpdate(callSessionId, { status: 'connected' });
  
  // Create ElevenLabs conversation for this call
  let elevenLabsConversation = null;
  
  const initializeElevenLabsConversation = async () => {
    try {
      console.log('🤖 Initializing ElevenLabs conversation for session:', callSessionId);
      console.log('📋 Session type:', callSession.isExternal ? 'External (Gupshup)' : 'Internal');
      
      elevenLabsConversation = await createConversation(
        callSessionId,
        callSession.patientData.treatmentType || 'general consultation'
      );
      console.log('✅ ElevenLabs conversation created for call:', callSessionId);
      
      // Set up message forwarding from ElevenLabs to Knowlarity
      setClientMessageHandler((sessionId, message) => {
        if (sessionId === callSessionId) {
          const knowlarityConnection = knowlarityConnections.get(callSessionId);
          if (knowlarityConnection && knowlarityConnection.ws && knowlarityConnection.ws.readyState === WebSocket.OPEN) {
            // Convert ElevenLabs audio to format expected by Knowlarity/Gupshup
            if (message.type === 'agent_audio' && message.audio) {
              // Send playAudio command to Knowlarity/Gupshup
              const playAudioCommand = {
                type: 'playAudio',
                data: {
                  audioContentType: 'raw',  
                  sampleRate: 16000,
                  audioContent: message.audio
                }
              };
              
              console.log('🔊 Sending ElevenLabs agent audio to caller via Gupshup/Knowlarity');
              console.log('📊 Audio size:', message.audio.length, 'characters (base64)');
              knowlarityConnection.ws.send(JSON.stringify(playAudioCommand));
            }
            
            // Handle other ElevenLabs message types
            if (message.type === 'agent_response' && message.text) {
              console.log('💬 Agent text response:', message.text.substring(0, 100) + '...');
            }
            
            if (message.type === 'agent_audio_end') {
              console.log('✅ Agent finished speaking');
            }
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error creating ElevenLabs conversation for call:', error);
      ws.close(1011, 'Failed to initialize conversation');
    }
  };

  // Helper function to send commands to Knowlarity
  const sendToKnowlarity = (command) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(command));
      console.log('📤 Sent command to Knowlarity:', command.type);
    }
  };

  // Add methods for call control
  const transferCall = (phoneNumber) => {
    sendToKnowlarity({
      type: 'transfer',
      data: { textContent: phoneNumber }
    });
  };

  const terminateStream = () => {
    sendToKnowlarity({ type: 'disconnect' });
  };

  const killAudio = () => {
    sendToKnowlarity({ type: 'killAudio' });
  };

  // Store control methods in connection object
  const knowlarityConnection = knowlarityConnections.get(callSessionId);
  knowlarityConnection.transferCall = transferCall;
  knowlarityConnection.terminateStream = terminateStream;
  knowlarityConnection.killAudio = killAudio;
  
  // Initialize ElevenLabs conversation
  initializeElevenLabsConversation();
  
  let isFirstMessage = true;
  
  ws.on('message', async (message) => {
    try {
      // First message is always JSON metadata from Knowlarity
      if (isFirstMessage) {
        const metadata = JSON.parse(message);
        console.log('📋 Received Knowlarity metadata:', JSON.stringify(metadata, null, 2));
        
        // Update call status to active
        handleCallStatusUpdate(callSessionId, { 
          status: 'connected',
          knowlarityMetadata: metadata
        });
        
        isFirstMessage = false;
        return;
      }
      
      // After first message, check if it's JSON or binary audio
      if (message instanceof Buffer) {
        // This is binary audio data from Knowlarity/Gupshup (16-bit PCM)
        console.log('🎵 Received audio chunk from caller, size:', message.length, 'bytes');
        
        // Convert binary PCM to base64 for ElevenLabs
        const audioBase64 = message.toString('base64');
        
        // Forward audio from caller to ElevenLabs
        if (elevenLabsConversation) {
          console.log('📤 Forwarding audio to ElevenLabs agent...');
          await sendAudioToAgent(callSessionId, audioBase64);
        } else {
          console.log('⚠️ ElevenLabs conversation not ready, audio dropped');
        }
      } else {
        // This might be a JSON control message or DTMF
        try {
          const data = JSON.parse(message);
          console.log('📋 Received JSON message from Knowlarity:', data);
          
          switch (data.type) {
            case 'call_start':
              console.log('📞 Call started for session:', callSessionId);
              handleCallStatusUpdate(callSessionId, { status: 'active' });
              break;
              
            case 'call_end':
              console.log('📞 Call ended for session:', callSessionId);
              handleCallStatusUpdate(callSessionId, { status: 'completed' });
              if (elevenLabsConversation) {
                await endConversation(callSessionId);
              }
              break;
              
            case 'dtmf':
              console.log('📞 DTMF received:', data.digit);
              // Handle DTMF inputs if needed
              break;
          }
        } catch (jsonError) {
          console.log('⚠️ Non-JSON message received:', message.toString().substring(0, 100));
        }
      }
    } catch (error) {
      console.error('❌ Error processing Knowlarity message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('📞 Knowlarity/Gupshup call stream closed for session:', callSessionId);
    console.log('🧹 Cleaning up connections and conversations...');
    knowlarityConnections.delete(callSessionId);
    if (elevenLabsConversation) {
      console.log('🤖 Ending ElevenLabs conversation...');
      endConversation(callSessionId);
    }
    handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
    console.log('✅ Cleanup completed for session:', callSessionId);
  });
  
  ws.on('error', (error) => {
    console.error('❌ Knowlarity WebSocket error:', error);
    knowlarityConnections.delete(callSessionId);
    if (elevenLabsConversation) {
      endConversation(callSessionId);
    }
    handleCallStatusUpdate(callSessionId, { status: 'failed', reason: error.message });
  });
}

// Public functions for call control
function transferCall(callSessionId, phoneNumber) {
  const connection = knowlarityConnections.get(callSessionId);
  if (connection && connection.transferCall) {
    connection.transferCall(phoneNumber);
    console.log(`📞 Transferring call ${callSessionId} to ${phoneNumber}`);
  } else {
    console.error(`❌ Cannot transfer call ${callSessionId} - connection not found`);
  }
}

function terminateStream(callSessionId) {
  const connection = knowlarityConnections.get(callSessionId);
  if (connection && connection.terminateStream) {
    connection.terminateStream();
    console.log(`📞 Terminating stream for call ${callSessionId}`);
  } else {
    console.error(`❌ Cannot terminate stream ${callSessionId} - connection not found`);
  }
}

function killAudio(callSessionId) {
  const connection = knowlarityConnections.get(callSessionId);
  if (connection && connection.killAudio) {
    connection.killAudio();
    console.log(`📞 Killing audio for call ${callSessionId}`);
  } else {
    console.error(`❌ Cannot kill audio ${callSessionId} - connection not found`);
  }
}

function cleanup() {
  // Cleanup Knowlarity connections
  knowlarityConnections.forEach((connection, callSessionId) => {
    if (connection.ws && connection.ws.readyState === WebSocket.CLOSED) {
      knowlarityConnections.delete(callSessionId);
      endConversation(callSessionId);
      handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
    }
  });
}

function shutdown() {
  // Close all Knowlarity connections
  knowlarityConnections.forEach((connection, callSessionId) => {
    if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close();
    }
    endConversation(callSessionId);
  });
}

// Placeholder functions - these will need to be implemented based on your other services
function getCallSession(callSessionId) {
  return outboundCallManager ? outboundCallManager.getCallSession(callSessionId) : null;
}

function handleCallStatusUpdate(callSessionId, statusUpdate) {
  if (outboundCallManager) {
    // Try to update the session, but don't fail if it doesn't exist (external sessions)
    try {
      outboundCallManager.handleCallStatusUpdate(callSessionId, statusUpdate);
    } catch (error) {
      console.log('⚠️ Status update failed for external session:', callSessionId, 'Status:', statusUpdate.status);
    }
  }
}

function createConversation(sessionId, treatmentType) {
  return elevenLabsAgent ? elevenLabsAgent.createConversation(sessionId, treatmentType) : null;
}

function setClientMessageHandler(handler) {
  if (elevenLabsAgent) {
    elevenLabsAgent.setClientMessageHandler(handler);
  }
}

function sendAudioToAgent(sessionId, audioData) {
  return elevenLabsAgent ? elevenLabsAgent.sendAudioToAgent(sessionId, audioData) : null;
}

function endConversation(sessionId) {
  return elevenLabsAgent ? elevenLabsAgent.endConversation(sessionId) : null;
}

module.exports = {
  initializeWebSocketHandler,
  handleConnection,
  transferCall,
  terminateStream,
  killAudio,
  cleanup,
  shutdown
};