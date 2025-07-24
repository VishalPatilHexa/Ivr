const WebSocket = require('ws');
const axios = require('axios');

// Environment variables
const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
const baseUrl = "https://api.elevenlabs.io/v1";

// Store conversations
const conversations = new Map();
let clientMessageHandler = null;

// Validate required environment variables
function validateEnvironment() {
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required');
  }
  if (!agentId) {
    throw new Error('ELEVENLABS_AGENT_ID is required');
  }
  
  console.log('✅ ElevenLabs Agent initialized with Agent ID:', agentId);
}

async function createConversation(sessionId, patientQuery) {
  try {
    const conversation = {
      sessionId,
      patientQuery,
      patientData: { query: patientQuery },
      isActive: true,
      createdAt: new Date(),
      agentWebSocket: null
    };

    conversations.set(sessionId, conversation);

    // Create ElevenLabs conversational AI session
    const agentWs = await createElevenLabsWebSocket(sessionId);
    conversation.agentWebSocket = agentWs;

    console.log('✅ Conversation created successfully for session:', sessionId);
    return conversation;
  } catch (error) {
    console.error('❌ Error creating conversation:', error);
    throw error;
  }
}

async function createElevenLabsWebSocket(sessionId) {
  return new Promise((resolve, reject) => {
    const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
    
    console.log('🔗 Connecting to ElevenLabs WebSocket:', wsUrl);
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': apiKey
      }
    });

    ws.on('open', () => {
      console.log('✅ ElevenLabs WebSocket connected for session:', sessionId);
      
      // Get conversation details
      const conversation = conversations.get(sessionId);
      
      // Send initial conversation setup with dynamic variables
      const initMessage = {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata: {
          user_id: sessionId,
          user_object: {
            name: 'Patient',
            language: 'hindi'
          }
        },
        dynamic_variables: {
          new_variable: conversation?.patientQuery || 'general treatment'
        }
      };
      
      console.log('📤 Sending init message:', JSON.stringify(initMessage));
      ws.send(JSON.stringify(initMessage));

      resolve(ws);
    });

    ws.on('message', (data) => {
      console.log('📨 Received from ElevenLabs:', data.toString());
      handleElevenLabsMessage(sessionId, data);
    });

    ws.on('error', (error) => {
      console.error('❌ ElevenLabs WebSocket error:', error);
      reject(error);
    });

    ws.on('close', (code, reason) => {
      console.log('🔌 ElevenLabs WebSocket closed for session:', sessionId, 'Code:', code, 'Reason:', reason.toString());
      endConversation(sessionId);
    });
  });
}

async function handleElevenLabsMessage(sessionId, data) {
  try {
    const message = JSON.parse(data);
    const conversation = conversations.get(sessionId);
    
    if (!conversation) {
      console.log('⚠️ No conversation found for session:', sessionId);
      return;
    }

    console.log('📋 Processing message type:', message.type);

    switch (message.type) {
      case 'user_transcript':
        // User's speech was transcribed by ElevenLabs
        const transcript = message.user_transcript_event?.user_transcript || message.user_transcript;
        console.log('👤 User transcript:', transcript);
        
        // Forward user transcript to client for display
        forwardToClient(sessionId, {
          type: 'user_transcript',
          text: transcript
        });
        break;

      case 'agent_response':
        // Agent's text response
        const agentText = message.agent_response_event?.agent_response || message.agent_response?.text || message.text;
        
        console.log('🤖 Agent response text:', agentText);
        
        if (agentText) {
          forwardToClient(sessionId, {
            type: 'agent_response',
            text: agentText
          });
        }
        break;

      case 'agent_response_audio_delta':
        // Streaming audio from agent
        if (message.agent_response_audio_delta_event?.delta_audio_base_64) {
          console.log('🔊 Agent audio chunk received, size:', message.agent_response_audio_delta_event.delta_audio_base_64.length);
          forwardToClient(sessionId, {
            type: 'agent_audio',
            audio: message.agent_response_audio_delta_event.delta_audio_base_64
          });
        }
        break;

      case 'audio':
        // Direct audio message
        if (message.audio_event?.audio_base_64) {
          console.log('🔊 Direct audio received, size:', message.audio_event.audio_base_64.length);
          forwardToClient(sessionId, {
            type: 'agent_audio',
            audio: message.audio_event.audio_base_64
          });
        }
        break;

      case 'agent_response_audio_end':
        // Agent finished speaking
        console.log('✅ Agent finished speaking');
        forwardToClient(sessionId, {
          type: 'agent_audio_end'
        });
        break;

      case 'conversation_end':
        console.log('🔚 Conversation ended for session:', sessionId);
        forwardToClient(sessionId, {
          type: 'conversation_ended',
          message: 'Conversation completed successfully'
        });
        break;

      case 'ping':
        console.log('📡 Ping received from ElevenLabs, event_id:', message.ping_event?.event_id);
        // Send pong back
        if (conversation && conversation.agentWebSocket) {
          const pongMessage = {
            pong_event: {
              event_id: message.ping_event?.event_id
            }
          };
          console.log('📤 Sending pong:', JSON.stringify(pongMessage));
          conversation.agentWebSocket.send(JSON.stringify(pongMessage));
        }
        break;

      case 'conversation_initiation_metadata':
        console.log('🎯 Conversation initiated, agent is ready');
        console.log('📋 Conversation ID:', message.conversation_initiation_metadata_event?.conversation_id);
        
        // Store conversation details
        if (conversation) {
          conversation.conversationId = message.conversation_initiation_metadata_event?.conversation_id;
          conversation.audioFormat = message.conversation_initiation_metadata_event?.agent_output_audio_format;
        }
        
        // Send a simple greeting to trigger the agent
        setTimeout(() => {
          if (conversation && conversation.agentWebSocket && conversation.agentWebSocket.readyState === 1) {
            conversation.agentWebSocket.send(JSON.stringify({
              user_text: 'Hi'
            }));
            console.log('📤 Sent simple greeting to trigger agent');
          }
        }, 1000);
        
        forwardToClient(sessionId, {
          type: 'agent_ready',
          message: 'Agent is ready to start conversation'
        });
        break;

      default:
        console.log('❓ Unknown message type:', message.type);
        console.log('📋 Full message:', JSON.stringify(message, null, 2));
    }
  } catch (error) {
    console.error('❌ Error handling ElevenLabs message:', error);
  }
}

async function sendToElevenLabs(sessionId, message) {
  const conversation = conversations.get(sessionId);
  if (conversation && conversation.agentWebSocket && conversation.agentWebSocket.readyState === WebSocket.OPEN) {
    console.log('📤 Sending to ElevenLabs:', JSON.stringify(message));
    conversation.agentWebSocket.send(JSON.stringify(message));
  } else {
    console.log('⚠️ Cannot send to ElevenLabs - WebSocket not ready');
  }
}

async function sendAudioToAgent(sessionId, audioData) {
  try {
    const message = {
      user_audio_chunk: audioData
    };
    
    await sendToElevenLabs(sessionId, message);
  } catch (error) {
    console.error('❌ Error sending audio to agent:', error);
  }
}

async function sendTextToAgent(sessionId, text) {
  try {
    const message = {
      user_text: text
    };
    
    await sendToElevenLabs(sessionId, message);
  } catch (error) {
    console.error('❌ Error sending text to agent:', error);
  }
}

function forwardToClient(sessionId, message) {
  // This will be called by the main server to forward messages to WebSocket clients
  if (clientMessageHandler) {
    clientMessageHandler(sessionId, message);
  }
}

function setClientMessageHandler(handler) {
  clientMessageHandler = handler;
}

async function endConversation(sessionId) {
  const conversation = conversations.get(sessionId);
  if (conversation) {
    if (conversation.agentWebSocket) {
      conversation.agentWebSocket.close();
    }
    conversation.isActive = false;
    conversations.delete(sessionId);
  }
}

function getConversation(sessionId) {
  return conversations.get(sessionId);
}

async function getConversationStatus(sessionId) {
  const conversation = conversations.get(sessionId);
  if (!conversation) return null;

  return {
    sessionId,
    isActive: conversation.isActive,
    patientData: conversation.patientData,
    createdAt: conversation.createdAt
  };
}

// Initialize on module load
validateEnvironment();

module.exports = {
  createConversation,
  sendAudioToAgent,
  sendTextToAgent,
  setClientMessageHandler,
  endConversation,
  getConversation,
  getConversationStatus
};