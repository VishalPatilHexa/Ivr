const WebSocket = require("ws");

class WebSocketHandler {
  constructor(elevenLabsAgent, outboundCallManager) {
    this.elevenLabsAgent = elevenLabsAgent;
    this.outboundCallManager = outboundCallManager;
    this.knowlarityConnections = new Map();
  }

  handleConnection(ws, req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // Check if this is a Knowlarity stream connection
    if (pathname.startsWith('/knowlarity-stream/')) {
      this.handleKnowlarityStream(ws, pathname);
      return;
    }
    
    // Unknown WebSocket connection
    console.log("🔗 Unknown WebSocket connection, closing");
    ws.close(1008, 'Unknown connection type');
  }

  handleKnowlarityStream(ws, pathname) {
    const callSessionId = pathname.split('/')[2];
    console.log("📞 New Knowlarity call stream connection for session:", callSessionId);
    
    // Store the Knowlarity connection with control methods
    this.knowlarityConnections.set(callSessionId, {
      ws,
      transferCall: null,
      terminateStream: null
    });
    
    // Get call session details
    const callSession = this.outboundCallManager.getCallSession(callSessionId);
    if (!callSession) {
      console.error('❌ Call session not found:', callSessionId);
      ws.close(1008, 'Call session not found');
      return;
    }
    
    // Update call status to connected
    this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'connected' });
    
    // Create ElevenLabs conversation for this call
    let elevenLabsConversation = null;
    
    const initializeElevenLabsConversation = async () => {
      try {
        elevenLabsConversation = await this.elevenLabsAgent.createConversation(
          callSessionId,
          callSession.patientData.treatmentType || 'general consultation'
        );
        console.log('✅ ElevenLabs conversation created for call:', callSessionId);
        
        // Set up message forwarding from ElevenLabs to Knowlarity
        this.elevenLabsAgent.setClientMessageHandler((sessionId, message) => {
          if (sessionId === callSessionId) {
            const knowlarityConnection = this.knowlarityConnections.get(callSessionId);
            if (knowlarityConnection && knowlarityConnection.ws && knowlarityConnection.ws.readyState === WebSocket.OPEN) {
              // Convert ElevenLabs audio to format expected by Knowlarity
              if (message.type === 'agent_audio' && message.audio) {
                // Send playAudio command to Knowlarity
                const playAudioCommand = {
                  type: 'playAudio',
                  data: {
                    audioContentType: 'raw',
                    sampleRate: 16000,
                    audioContent: message.audio
                  }
                };
                
                console.log('🔊 Sending audio to Knowlarity for playback');
                knowlarityConnection.ws.send(JSON.stringify(playAudioCommand));
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

    // Store control methods in connection object
    const knowlarityConnection = this.knowlarityConnections.get(callSessionId);
    knowlarityConnection.transferCall = transferCall;
    knowlarityConnection.terminateStream = terminateStream;
    
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
          this.outboundCallManager.handleCallStatusUpdate(callSessionId, { 
            status: 'connected',
            knowlarityMetadata: metadata
          });
          
          isFirstMessage = false;
          return;
        }
        
        // After first message, check if it's JSON or binary audio
        if (message instanceof Buffer) {
          // This is binary audio data from Knowlarity (16-bit PCM)
          console.log('🎵 Received audio chunk from Knowlarity, size:', message.length);
          
          // Convert binary PCM to base64 for ElevenLabs
          const audioBase64 = message.toString('base64');
          
          // Forward audio from Knowlarity to ElevenLabs
          if (elevenLabsConversation) {
            await this.elevenLabsAgent.sendAudioToAgent(callSessionId, audioBase64);
          }
        } else {
          // This might be a JSON control message
          try {
            const data = JSON.parse(message);
            console.log('📋 Received JSON message from Knowlarity:', data);
            
            switch (data.type) {
              case 'call_start':
                console.log('📞 Call started for session:', callSessionId);
                this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'active' });
                break;
                
              case 'call_end':
                console.log('📞 Call ended for session:', callSessionId);
                this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'completed' });
                if (elevenLabsConversation) {
                  await this.elevenLabsAgent.endConversation(callSessionId);
                }
                break;
                
              case 'dtmf':
                console.log('📞 DTMF received:', data.digit);
                // Handle DTMF inputs if needed
                break;
            }
          } catch (jsonError) {
            console.log('⚠️ Non-JSON message received (might be audio):', message.toString().substring(0, 100));
          }
        }
      } catch (error) {
        console.error('❌ Error processing Knowlarity message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('📞 Knowlarity call stream closed for session:', callSessionId);
      this.knowlarityConnections.delete(callSessionId);
      if (elevenLabsConversation) {
        this.elevenLabsAgent.endConversation(callSessionId);
      }
      this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
    });
    
    ws.on('error', (error) => {
      console.error('❌ Knowlarity WebSocket error:', error);
      this.knowlarityConnections.delete(callSessionId);
      if (elevenLabsConversation) {
        this.elevenLabsAgent.endConversation(callSessionId);
      }
      this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'failed', reason: error.message });
    });
  }

  // Public methods for call control
  transferCall(callSessionId, phoneNumber) {
    const connection = this.knowlarityConnections.get(callSessionId);
    if (connection && connection.transferCall) {
      connection.transferCall(phoneNumber);
      console.log(`📞 Transferring call ${callSessionId} to ${phoneNumber}`);
    } else {
      console.error(`❌ Cannot transfer call ${callSessionId} - connection not found`);
    }
  }

  terminateStream(callSessionId) {
    const connection = this.knowlarityConnections.get(callSessionId);
    if (connection && connection.terminateStream) {
      connection.terminateStream();
      console.log(`📞 Terminating stream for call ${callSessionId}`);
    } else {
      console.error(`❌ Cannot terminate stream ${callSessionId} - connection not found`);
    }
  }

  cleanup() {
    // Cleanup Knowlarity connections
    this.knowlarityConnections.forEach((connection, callSessionId) => {
      if (connection.ws && connection.ws.readyState === WebSocket.CLOSED) {
        this.knowlarityConnections.delete(callSessionId);
        this.elevenLabsAgent.endConversation(callSessionId);
        this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
      }
    });
  }

  shutdown() {
    // Close all Knowlarity connections
    this.knowlarityConnections.forEach((connection, callSessionId) => {
      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
      this.elevenLabsAgent.endConversation(callSessionId);
    });
  }
}

module.exports = WebSocketHandler;