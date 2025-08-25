const WebSocket = require('ws');

/*
 * ===============================================================================
 * MASTRA BRIDGE SERVICE
 * ===============================================================================
 * 
 * PURPOSE: Bridge between Server1 (current service) and Mastra Server
 * 
 * FLOW:
 * Knowlarity → Server1 → MastraBridge → Mastra Server → Response → Server1 → Knowlarity
 * 
 * This replaces direct audio processing with forwarding to Mastra server
 * 
 * ===============================================================================
 */

class MastraBridge {
  constructor(sessionId, clientWs) {
    this.sessionId = sessionId;
    this.clientWs = clientWs; // WebSocket connection to Knowlarity
    this.mastraWs = null; // WebSocket connection to Mastra server
    this.isConnected = false;
    this.messageQueue = []; // Queue messages while connecting
  }

  async connectToMastraServer() {
    try {
      const mastraServerUrl = process.env.MASTRA_SERVER_URL || 'ws://35.154.116.230:3019';
      const streamEndpoint = `${mastraServerUrl}/voice`; // Mastra Gateway endpoint
      
      console.log(`🔗 Connecting to Mastra server for session: ${this.sessionId}`);
      console.log(`🌐 Mastra endpoint: ${streamEndpoint}`);

      this.mastraWs = new WebSocket(streamEndpoint);

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        console.error('⏰ Mastra server connection timeout');
        this.mastraWs.close();
        throw new Error('Connection timeout to Mastra server');
      }, 10000);

      this.mastraWs.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log(`✅ Connected to Mastra server for session: ${this.sessionId}`);
        this.isConnected = true;
        this.startSession();
        this.processMessageQueue();
      });

      this.mastraWs.on('message', (data) => {
        this.handleMastraResponse(data);
      });

      this.mastraWs.on('error', (error) => {
        clearTimeout(connectionTimeout);
        console.error('❌ Mastra server connection error:', error.message);
        this.isConnected = false;
      });

      this.mastraWs.on('close', (code, reason) => {
        clearTimeout(connectionTimeout);
        console.log(`🔌 Mastra server connection closed for session: ${this.sessionId}`);
        console.log('🔍 Close code:', code, 'Reason:', reason ? reason.toString() : 'No reason provided');
        this.isConnected = false;
      });

      return new Promise((resolve, reject) => {
        this.mastraWs.on('open', resolve);
        this.mastraWs.on('error', reject);
      });

    } catch (error) {
      console.error(`❌ Failed to connect to Mastra server for session ${this.sessionId}:`, error);
      throw error;
    }
  }

  startSession() {
    // Send session initialization to Mastra server
    const initMessage = {
      type: 'call_start',
      callerId: this.sessionId,
      language: 'hi-IN'
    };

    console.log('🚀 Starting Mastra session:', initMessage);
    this.sendToMastra(initMessage);
  }

  forwardAudioToMastra(audioBuffer) {
    const audioMessage = {
      type: 'audio',
      audioBuffer: audioBuffer, // Base64 audio from Knowlarity
      isLast: false
    };

    if (this.isConnected) {
      this.sendToMastra(audioMessage);
      console.log(`🎵 Forwarded audio to Mastra server - Size: ${audioBuffer.length} chars`);
    } else {
      // Queue message if not connected yet
      this.messageQueue.push(audioMessage);
      console.log('⏳ Queued audio message - Mastra not connected yet');
    }
  }

  forwardTextToMastra(text) {
    const textMessage = {
      type: 'text_message',
      text: text
    };

    if (this.isConnected) {
      this.sendToMastra(textMessage);
      console.log(`💬 Forwarded text to Mastra server: ${text}`);
    } else {
      this.messageQueue.push(textMessage);
      console.log('⏳ Queued text message - Mastra not connected yet');
    }
  }

  handleMastraResponse(data) {
    try {
      const response = JSON.parse(data.toString());
      console.log('📥 Received from Mastra server:', response.type);

      switch (response.type) {
        case 'connection':
          console.log('🔗 Mastra server connection confirmed:', response.message);
          break;

        case 'call_started':
          console.log(`📞 Mastra call started: ${response.sessionId}`);
          if (response.defaultGreeting?.text) {
            console.log(`🎤 Default greeting: ${response.defaultGreeting.text}`);
          }
          
          // Send agent ready to client
          this.sendToClient({
            type: 'agent_ready',
            message: 'Mastra Bhavna agent is ready for conversation'
          });
          break;

        case 'agent_response':
          console.log(`🤖 Bhavna said: "${response.agentText}"`);
          
          // Forward agent's audio response back to Knowlarity
          if (response.audioContent) {
            const audioBuffer = Buffer.from(response.audioContent, 'base64');
            console.log(`🔊 Received ${audioBuffer.length} bytes of audio from Mastra`);
            
            this.sendToClient({
              type: 'agent_audio',
              audio: response.audioContent,
              sessionId: this.sessionId
            });

            // Send audio end signal
            setTimeout(() => {
              this.sendToClient({
                type: 'agent_audio_end'
              });
            }, 100);
          }

          // Forward agent text response
          this.sendToClient({
            type: 'agent_response',
            text: response.agentText,
            sessionId: this.sessionId
          });
          break;

        case 'transcription':
          console.log(`📝 Live transcription: "${response.text}" (${response.role})`);
          
          // Forward transcription to client for logging
          if (response.role === 'user') {
            this.sendToClient({
              type: 'user_transcript',
              text: response.text,
              confidence: response.confidence
            });
          }
          break;

        case 'audio_received':
          console.log(`✅ Audio chunk ${response.status}`);
          break;

        case 'call_ended':
          console.log(`📞 Mastra call ended: ${response.sessionId} (${response.duration}ms)`);
          this.sendToClient({
            type: 'conversation_ended',
            message: 'Mastra conversation completed successfully'
          });
          break;

        case 'error':
          console.error('❌ Mastra server error:', response.error);
          this.sendToClient({
            type: 'agent_error',
            message: response.error || 'Mastra server error'
          });
          break;

        default:
          console.log('🔔 Unknown Mastra response type:', response.type);
      }

    } catch (error) {
      console.error('❌ Error parsing Mastra response:', error);
    }
  }

  sendToMastra(data) {
    if (this.mastraWs && this.mastraWs.readyState === WebSocket.OPEN) {
      this.mastraWs.send(JSON.stringify(data));
    } else {
      console.warn('⚠️ Cannot send to Mastra - WebSocket not ready');
    }
  }

  sendToClient(data) {
    // This will be called by the websocket handler's callback system
    if (this.clientCallback) {
      this.clientCallback(this.sessionId, data);
    } else {
      console.warn('⚠️ No client callback registered - message dropped:', data.type);
    }
  }

  setClientCallback(callback) {
    this.clientCallback = callback;
    console.log('✅ Mastra Bridge client callback registered');
  }

  processMessageQueue() {
    // Send any queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.sendToMastra(message);
      console.log('📤 Processed queued message:', message.type);
    }
  }

  endCall() {
    if (this.isConnected) {
      const endMessage = {
        type: 'call_end'
      };
      
      console.log('📞 Ending Mastra call');
      this.sendToMastra(endMessage);
    }
  }

  close() {
    if (this.mastraWs) {
      console.log(`🔌 Closing Mastra bridge for session: ${this.sessionId}`);
      this.mastraWs.close();
      this.mastraWs = null;
    }
    this.isConnected = false;
    this.messageQueue = [];
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
      queuedMessages: this.messageQueue.length
    };
  }
}

// Active bridge sessions storage
const activeBridges = new Map();

/**
 * ===============================================================================
 * BRIDGE SERVICE INTERFACE (Compatible with agent services)
 * ===============================================================================
 */

/**
 * Create new conversation session with Mastra Bridge
 */
async function createConversation(sessionId, patientQuery) {
  try {
    console.log('🌉 Creating Mastra bridge for session:', sessionId);
    
    // Create bridge instance (clientWs will be set via callback)
    const bridge = new MastraBridge(sessionId, null);
    
    // Connect to Mastra server
    await bridge.connectToMastraServer();
    
    const conversationSession = {
      sessionId,
      patientQuery,
      patientData: { query: patientQuery },
      isActive: true,
      createdAt: new Date(),
      mastraBridge: bridge
    };

    activeBridges.set(sessionId, conversationSession);

    console.log('✅ Mastra bridge conversation created for session:', sessionId);
    return conversationSession;
  } catch (error) {
    console.error('❌ Error creating Mastra bridge conversation for session:', sessionId);
    console.error('💥 Error details:', error.message);
    
    // Clean up failed conversation
    activeBridges.delete(sessionId);
    
    throw error;
  }
}

/**
 * Send audio chunk to Mastra server via bridge
 */
async function sendAudioToAgent(sessionId, audioData) {
  try {
    const conversationSession = activeBridges.get(sessionId);
    if (!conversationSession) {
      console.log('⚠️ No Mastra bridge found for session:', sessionId);
      return;
    }

    const bridge = conversationSession.mastraBridge;
    if (!bridge) {
      console.log('⚠️ Bridge not initialized for session:', sessionId);
      return;
    }

    console.log(`🌉 Forwarding audio via bridge - Session: ${sessionId}, Data size: ${audioData.length} chars`);
    bridge.forwardAudioToMastra(audioData);
  } catch (error) {
    console.error('❌ Error forwarding audio via Mastra bridge:', error);
  }
}

/**
 * Send text message to Mastra server via bridge
 */
async function sendTextToAgent(sessionId, textContent) {
  try {
    const conversationSession = activeBridges.get(sessionId);
    if (!conversationSession) {
      console.log('⚠️ No Mastra bridge found for session:', sessionId);
      return;
    }

    const bridge = conversationSession.mastraBridge;
    if (bridge) {
      bridge.forwardTextToMastra(textContent);
    }
  } catch (error) {
    console.error('❌ Error forwarding text via Mastra bridge:', error);
  }
}

/**
 * Set handler for messages to be forwarded to calling system
 */
function setClientMessageHandler(messageHandler) {
  // Set callback for all active bridges
  activeBridges.forEach((session, sessionId) => {
    if (session.mastraBridge) {
      session.mastraBridge.setClientCallback(messageHandler);
    }
  });
  
  // Store handler for future bridges
  global.mastraBridgeMessageHandler = messageHandler;
  console.log('✅ Mastra Bridge message forwarding handler registered for all sessions');
}

/**
 * End conversation and cleanup resources
 */
async function endConversation(sessionId) {
  const conversationSession = activeBridges.get(sessionId);
  if (conversationSession) {
    const bridge = conversationSession.mastraBridge;
    if (bridge) {
      bridge.endCall();
      bridge.close();
    }
    
    conversationSession.isActive = false;
    activeBridges.delete(sessionId);
    console.log('🧹 Mastra bridge conversation ended and cleaned up:', sessionId);
  }
}

/**
 * Get conversation details
 */
function getConversation(sessionId) {
  return activeBridges.get(sessionId);
}

/**
 * Get conversation status
 */
async function getConversationStatus(sessionId) {
  const conversationSession = activeBridges.get(sessionId);
  if (!conversationSession) return null;

  const bridge = conversationSession.mastraBridge;
  const bridgeStatus = bridge ? bridge.getConnectionStatus() : null;

  return {
    sessionId,
    isActive: conversationSession.isActive,
    patientData: conversationSession.patientData,
    createdAt: conversationSession.createdAt,
    bridgeStatus
  };
}

// Export the service interface (compatible with other agent services)
module.exports = {
  createConversation,
  sendAudioToAgent,
  sendTextToAgent,
  setClientMessageHandler,
  endConversation,
  getConversation,
  getConversationStatus,
  // Export class for direct usage if needed
  MastraBridge
};