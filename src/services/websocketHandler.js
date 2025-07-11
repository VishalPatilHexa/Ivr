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
    
    // Store the Knowlarity connection
    this.knowlarityConnections.set(callSessionId, ws);
    
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
            const knowlarityWs = this.knowlarityConnections.get(callSessionId);
            if (knowlarityWs && knowlarityWs.readyState === WebSocket.OPEN) {
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
                knowlarityWs.send(JSON.stringify(playAudioCommand));
              }
            }
          }
        });
        
      } catch (error) {
        console.error('❌ Error creating ElevenLabs conversation for call:', error);
        ws.close(1011, 'Failed to initialize conversation');
      }
    };
    
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

  cleanup() {
    // Cleanup Knowlarity connections
    this.knowlarityConnections.forEach((connection, callSessionId) => {
      if (connection.readyState === WebSocket.CLOSED) {
        this.knowlarityConnections.delete(callSessionId);
        this.elevenLabsAgent.endConversation(callSessionId);
        this.outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
      }
    });
  }

  shutdown() {
    // Close all Knowlarity connections
    this.knowlarityConnections.forEach((connection, callSessionId) => {
      if (connection.readyState === WebSocket.OPEN) {
        connection.close();
      }
      this.elevenLabsAgent.endConversation(callSessionId);
    });
  }
}

module.exports = WebSocketHandler;