const WebSocket = require('ws');

/*
 * ===============================================================================
 * MASTRA VOICE CLIENT SERVICE
 * ===============================================================================
 * 
 * PURPOSE: Connects to Mastra Voice Gateway for real-time voice conversations
 * 
 * WORKFLOW:
 * 1. Connect to Mastra Gateway via WebSocket
 * 2. Handle bidirectional audio/text communication with Bhavna agent
 * 3. Process agent responses and forward to calling system
 * 4. Maintain conversation state and session management
 * 
 * AUDIO FLOW:
 * - INPUT: Receives base64 audio chunks from caller
 * - OUTPUT: Streams agent audio responses back to caller
 * - FORMATS: Handles PCM/base64 audio conversion
 * 
 * ===============================================================================
 */

class MastraVoiceClient {
  constructor(gatewayUrl) {
    this.gatewayUrl = gatewayUrl;
    this.ws = null;
    this.currentSession = null;
    this.messageForwardingHandler = null; // Bridge to websocketHandler
  }

  // Connect to Mastra Gateway
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.gatewayUrl);

      this.ws.on('open', () => {
        console.log('✅ Connected to Mastra Voice Gateway');
        this.setupEventHandlers();
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('❌ Connection error:', error);
        reject(error);
      });
    });
  }

  // Setup event handlers for gateway responses
  setupEventHandlers() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error parsing message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('❌ Connection closed');
      this.currentSession = null;
    });
  }

  // Handle incoming messages from gateway
  handleMessage(message) {
    const { type, ...data } = message;

    switch (type) {
      case 'connection':
        console.log('🔗 Gateway connection confirmed:', data.message);
        break;

      case 'call_started':
        this.currentSession = data.sessionId;
        console.log(`📞 Call started: ${data.sessionId}`);
        console.log(`🎤 Default greeting: ${data.defaultGreeting?.text || 'No greeting provided'}`);
        
        // Use the original session ID for consistency with websocket handler
        const originalSessionId = this.originalSessionId || data.sessionId;
        console.log(`🔗 Mapping Mastra session ${data.sessionId} to original session ${originalSessionId}`);
        
        // Forward to websocket handler using original session ID
        this.forwardToClient(originalSessionId, {
          type: 'agent_ready',
          message: 'Mastra Bhavna agent is ready for conversation'
        });
        
        // Trigger callback if set
        this.onCallStarted?.(data);
        break;

      case 'agent_response':
        console.log(`🤖 Bhavna said: "${data.agentText}"`);
        
        // Use the original session ID for consistency
        const responseSessionId = this.originalSessionId || data.sessionId || this.currentSession;
        
        if (data.audioContent) {
          // Convert base64 audio back to buffer for debugging
          const audioBuffer = Buffer.from(data.audioContent, 'base64');
          console.log(`🔊 Received ${audioBuffer.length} bytes of audio`);
          
          // Forward audio to websocket handler
          this.forwardToClient(responseSessionId, {
            type: 'agent_audio',
            audio: data.audioContent // Keep as base64 for forwarding
          });
          
          // Send audio end signal after a brief delay
          setTimeout(() => {
            this.forwardToClient(responseSessionId, {
              type: 'agent_audio_end'
            });
          }, 100);
        }

        // Forward agent text response
        this.forwardToClient(responseSessionId, {
          type: 'agent_response',
          text: data.agentText
        });

        // Trigger callback if set
        this.onAgentResponse?.(data);
        break;

      case 'transcription':
        console.log(`📝 Live transcription: "${data.text}" (${data.role})`);
        
        // Forward transcription to websocket handler
        if (data.role === 'user') {
          this.forwardToClient(data.sessionId || this.currentSession, {
            type: 'user_transcript',
            text: data.text
          });
        }
        
        this.onTranscription?.(data);
        break;

      case 'audio_received':
        console.log(`✅ Audio chunk ${data.status}`);
        break;

      case 'call_ended':
        console.log(`📞 Call ended: ${data.sessionId} (${data.duration}ms)`);
        
        // Forward call end to websocket handler
        this.forwardToClient(data.sessionId, {
          type: 'conversation_ended',
          message: 'Mastra conversation completed successfully'
        });
        
        this.currentSession = null;
        this.onCallEnded?.(data);
        break;

      case 'error':
        console.error('❌ Gateway error:', data.error);
        
        // Forward error to websocket handler
        this.forwardToClient(this.currentSession, {
          type: 'agent_error',
          message: data.error
        });
        
        this.onError?.(data);
        break;

      default:
        console.log('🔔 Unknown message type:', type, data);
    }
  }

  // Start call with Bhavna agent
  startCall(callerId, language = 'hi-IN') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Store original session ID for mapping
    this.originalSessionId = callerId;

    const message = {
      type: 'call_start',
      callerId,
      language
    };

    console.log('🚀 Starting call with Mastra Gateway:', message);
    this.ws.send(JSON.stringify(message));
  }

  // Send audio chunk to agent
  sendAudio(audioBuffer, isLast = false) {
    if (!this.currentSession && !this.ws) {
      console.warn('⚠️ No active session or connection for audio');
      return;
    }

    // Convert buffer to base64 if needed
    const audioBase64 = Buffer.isBuffer(audioBuffer) 
      ? audioBuffer.toString('base64')
      : audioBuffer;

    const message = {
      type: 'audio',
      audioBuffer: audioBase64,
      isLast
    };

    console.log(`🎵 Sending audio to Mastra Gateway - Size: ${audioBase64.length} chars`);
    this.ws.send(JSON.stringify(message));
  }

  // Send text message to agent
  sendText(text) {
    if (!this.currentSession && !this.ws) {
      console.warn('⚠️ No active session or connection for text');
      return;
    }

    const message = {
      type: 'text_message',
      text
    };

    console.log('💬 Sending text to Mastra Gateway:', text);
    this.ws.send(JSON.stringify(message));
  }

  // End the call
  endCall() {
    if (!this.currentSession && !this.ws) {
      console.warn('No active session to end');
      return;
    }

    const message = {
      type: 'call_end'
    };

    console.log('📞 Ending call with Mastra Gateway');
    this.ws.send(JSON.stringify(message));
  }

  // Forward messages to the calling system (websocketHandler)
  forwardToClient(sessionId, messageToForward) {
    if (this.messageForwardingHandler) {
      this.messageForwardingHandler(sessionId, messageToForward);
    } else {
      console.log('⚠️ No message handler registered - message dropped:', messageToForward.type);
    }
  }

  // Set handler for messages to be forwarded to calling system
  setClientMessageHandler(messageHandler) {
    this.messageForwardingHandler = messageHandler;
    console.log('✅ Mastra Voice Client message forwarding handler registered');
  }

  // Disconnect from gateway
  disconnect() {
    if (this.ws) {
      console.log('🔌 Disconnecting from Mastra Gateway');
      this.ws.close();
      this.ws = null;
      this.currentSession = null;
    }
  }

  // Check if connected
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// Active conversations storage (similar to ElevenLabs service)
const activeConversations = new Map();
let mastraClient = null;

// Environment configuration
const mastraGatewayUrl = process.env.MASTRA_GATEWAY_URL || 'ws://35.154.116.230:3019/voice';

/**
 * Initialize Mastra Voice Client
 */
async function initializeMastraClient() {
  if (!mastraClient) {
    mastraClient = new MastraVoiceClient(mastraGatewayUrl);
    try {
      await mastraClient.connect();
      console.log('✅ Mastra Voice Client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Mastra Voice Client:', error);
      throw error;
    }
  }
  return mastraClient;
}

/**
 * ===============================================================================
 * SERVICE INTERFACE (Compatible with ElevenLabs service)
 * ===============================================================================
 */

/**
 * Create new conversation session with Mastra
 */
async function createConversation(sessionId, patientQuery) {
  try {
    const client = await initializeMastraClient();
    
    const conversationSession = {
      sessionId,
      patientQuery,
      patientData: { query: patientQuery },
      isActive: true,
      createdAt: new Date(),
      mastraClient: client
    };

    activeConversations.set(sessionId, conversationSession);

    // Start call with Mastra Gateway
    client.startCall(sessionId, 'hi-IN');

    console.log('✅ Mastra conversation created for session:', sessionId);
    return conversationSession;
  } catch (error) {
    console.error('❌ Error creating Mastra conversation:', error);
    throw error;
  }
}

/**
 * Send audio chunk to Mastra agent
 */
async function sendAudioToAgent(sessionId, audioData) {
  try {
    const conversationSession = activeConversations.get(sessionId);
    if (!conversationSession) {
      console.log('⚠️ No Mastra conversation found for session:', sessionId);
      return;
    }

    const client = conversationSession.mastraClient;
    if (!client || !client.isConnected()) {
      console.log('⚠️ Mastra client not connected for session:', sessionId);
      return;
    }

    console.log(`🎵 Sending audio to Mastra agent - Session: ${sessionId}, Data size: ${audioData.length} chars`);
    client.sendAudio(audioData);
  } catch (error) {
    console.error('❌ Error sending audio to Mastra agent:', error);
  }
}

/**
 * Send text message to Mastra agent
 */
async function sendTextToAgent(sessionId, textContent) {
  try {
    const conversationSession = activeConversations.get(sessionId);
    if (!conversationSession) {
      console.log('⚠️ No Mastra conversation found for session:', sessionId);
      return;
    }

    const client = conversationSession.mastraClient;
    if (!client || !client.isConnected()) {
      console.log('⚠️ Mastra client not connected for session:', sessionId);
      return;
    }

    client.sendText(textContent);
  } catch (error) {
    console.error('❌ Error sending text to Mastra agent:', error);
  }
}

/**
 * Set handler for messages to be forwarded to calling system
 */
function setClientMessageHandler(messageHandler) {
  if (mastraClient) {
    mastraClient.setClientMessageHandler(messageHandler);
  } else {
    // Store handler for when client is initialized
    setTimeout(() => {
      if (mastraClient) {
        mastraClient.setClientMessageHandler(messageHandler);
      }
    }, 1000);
  }
}

/**
 * End conversation and cleanup resources
 */
async function endConversation(sessionId) {
  const conversationSession = activeConversations.get(sessionId);
  if (conversationSession) {
    const client = conversationSession.mastraClient;
    if (client && client.isConnected()) {
      client.endCall();
    }
    
    conversationSession.isActive = false;
    activeConversations.delete(sessionId);
    console.log('🧹 Mastra conversation ended and cleaned up:', sessionId);
  }
}

/**
 * Get conversation details
 */
function getConversation(sessionId) {
  return activeConversations.get(sessionId);
}

/**
 * Get conversation status
 */
async function getConversationStatus(sessionId) {
  const conversationSession = activeConversations.get(sessionId);
  if (!conversationSession) return null;

  return {
    sessionId,
    isActive: conversationSession.isActive,
    patientData: conversationSession.patientData,
    createdAt: conversationSession.createdAt
  };
}

// Export the service interface (compatible with ElevenLabs)
module.exports = {
  createConversation,
  sendAudioToAgent,
  sendTextToAgent,
  setClientMessageHandler,
  endConversation,
  getConversation,
  getConversationStatus,
  // Export class for direct usage if needed
  MastraVoiceClient
};