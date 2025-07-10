const WebSocket = require('ws');
const axios = require('axios');
const { MCPServer } = require('../mcp/mcpServer');

class ElevenLabsAgent {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.agentId = process.env.ELEVENLABS_AGENT_ID;
    this.baseUrl = "https://api.elevenlabs.io/v1";
    this.mcpServer = new MCPServer();
    this.conversations = new Map();
    
    // Validate required environment variables
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required');
    }
    if (!this.agentId) {
      throw new Error('ELEVENLABS_AGENT_ID is required');
    }
    
    console.log('✅ ElevenLabs Agent initialized with Agent ID:', this.agentId);
  }

  async createConversation(sessionId, patientQuery) {
    try {
      const conversation = {
        sessionId,
        patientQuery,
        patientData: { query: patientQuery },
        isActive: true,
        createdAt: new Date(),
        agentWebSocket: null
      };

      this.conversations.set(sessionId, conversation);

      // Create ElevenLabs conversational AI session
      const agentWs = await this.createElevenLabsWebSocket(sessionId);
      conversation.agentWebSocket = agentWs;

      console.log('✅ Conversation created successfully for session:', sessionId);
      return conversation;
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
      throw error;
    }
  }

  async createElevenLabsWebSocket(sessionId) {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${this.agentId}`;
      
      console.log('🔗 Connecting to ElevenLabs WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      ws.on('open', () => {
        console.log('✅ ElevenLabs WebSocket connected for session:', sessionId);
        
        // Get conversation details
        const conversation = this.conversations.get(sessionId);
        
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

        // Don't send initial message here - wait for conversation_initiation_metadata

        resolve(ws);
      });

      ws.on('message', (data) => {
        console.log('📨 Received from ElevenLabs:', data.toString());
        this.handleElevenLabsMessage(sessionId, data);
      });

      ws.on('error', (error) => {
        console.error('❌ ElevenLabs WebSocket error:', error);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log('🔌 ElevenLabs WebSocket closed for session:', sessionId, 'Code:', code, 'Reason:', reason.toString());
        this.endConversation(sessionId);
      });
    });
  }

  async handleElevenLabsMessage(sessionId, data) {
    try {
      const message = JSON.parse(data);
      const conversation = this.conversations.get(sessionId);
      
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
          this.forwardToClient(sessionId, {
            type: 'user_transcript',
            text: transcript
          });
          
          await this.saveUserResponse(sessionId, transcript);
          break;

        case 'agent_response':
          // Agent's text response - this usually comes first
          const agentText = message.agent_response_event?.agent_response || message.agent_response?.text || message.text;
          
          console.log('🤖 Agent response text:', agentText);
          
          if (agentText) {
            this.forwardToClient(sessionId, {
              type: 'agent_response',
              text: agentText
            });
          }
          break;

        case 'agent_response_audio_delta':
          // Streaming audio from agent - this is the actual voice
          if (message.agent_response_audio_delta_event?.delta_audio_base_64) {
            console.log('🔊 Agent audio chunk received, size:', message.agent_response_audio_delta_event.delta_audio_base_64.length);
            this.forwardToClient(sessionId, {
              type: 'agent_audio',
              audio: message.agent_response_audio_delta_event.delta_audio_base_64
            });
          }
          break;

        case 'audio':
          // Direct audio message
          if (message.audio_event?.audio_base_64) {
            console.log('🔊 Direct audio received, size:', message.audio_event.audio_base_64.length);
            this.forwardToClient(sessionId, {
              type: 'agent_audio',
              audio: message.audio_event.audio_base_64
            });
          }
          break;

        case 'agent_response_audio_end':
          // Agent finished speaking
          console.log('✅ Agent finished speaking');
          this.forwardToClient(sessionId, {
            type: 'agent_audio_end'
          });
          break;


        case 'conversation_end':
          console.log('🔚 Conversation ended for session:', sessionId);
          await this.saveConversationData(sessionId);
          this.forwardToClient(sessionId, {
            type: 'conversation_ended',
            message: 'Conversation completed successfully'
          });
          break;

        case 'agent_response_correction':
          console.log('🔄 Agent correction received');
          break;

        case 'ping':
          console.log('📡 Ping received from ElevenLabs, event_id:', message.ping_event?.event_id);
          // Send pong back with correct format
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
          
          // The agent is now ready and should start automatically with dynamic variables
          console.log('🎯 Agent is ready with dynamic variables, should start automatically');
          
          // Send a simple greeting to trigger the agent
          setTimeout(() => {
            if (conversation && conversation.agentWebSocket && conversation.agentWebSocket.readyState === 1) {
              conversation.agentWebSocket.send(JSON.stringify({
                user_text: 'Hi'
              }));
              console.log('📤 Sent simple greeting to trigger agent');
            }
          }, 1000);
          
          this.forwardToClient(sessionId, {
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

  async saveUserResponse(sessionId, transcript) {
    try {
      const conversation = this.conversations.get(sessionId);
      if (!conversation) return;

      // Extract meaningful data from transcript (simplified approach)
      // The ElevenLabs agent should be configured to extract structured data
      // For now, we'll save the raw transcript
      
      const responseData = {
        transcript,
        timestamp: new Date(),
        sessionId
      };
      
      // Save to MCP
      await this.mcpServer.executeTool('save_patient_response', {
        sessionId,
        field: 'user_response',
        value: transcript,
        timestamp: new Date()
      });
      
      console.log('💾 User response saved:', transcript);
      
    } catch (error) {
      console.error('❌ Error saving user response:', error);
    }
  }

  async sendToElevenLabs(sessionId, message) {
    const conversation = this.conversations.get(sessionId);
    if (conversation && conversation.agentWebSocket && conversation.agentWebSocket.readyState === WebSocket.OPEN) {
      console.log('📤 Sending to ElevenLabs:', JSON.stringify(message));
      conversation.agentWebSocket.send(JSON.stringify(message));
    } else {
      console.log('⚠️ Cannot send to ElevenLabs - WebSocket not ready');
    }
  }

  async sendAudioToAgent(sessionId, audioData) {
    try {
      // ElevenLabs expects simple format: just "user_audio_chunk" with base64 string
      const message = {
        user_audio_chunk: audioData // Just the base64 encoded audio string
      };
      
      await this.sendToElevenLabs(sessionId, message);
    } catch (error) {
      console.error('❌ Error sending audio to agent:', error);
    }
  }

  async sendTextToAgent(sessionId, text) {
    try {
      const message = {
        user_text: text // Just the text string
      };
      
      await this.sendToElevenLabs(sessionId, message);
    } catch (error) {
      console.error('❌ Error sending text to agent:', error);
    }
  }

  async saveConversationData(sessionId) {
    try {
      const conversation = this.conversations.get(sessionId);
      if (!conversation) return;

      // Save complete conversation data through MCP
      await this.mcpServer.executeTool('save_patient_data', {
        sessionId,
        patientData: conversation.patientData,
        completedAt: new Date(),
        status: 'completed'
      });

      // Generate summary
      const summary = this.generateSummary(conversation.patientData);
      await this.mcpServer.executeTool('save_conversation_summary', {
        sessionId,
        summary,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error saving conversation data:', error);
    }
  }

  generateSummary(patientData) {
    return `
    पेशेंट की जानकारी:
    - नाम: ${patientData.patientName || 'N/A'}
    - उम्र: ${patientData.age || 'N/A'}
    - लिंग: ${patientData.gender || 'N/A'}
    - स्वास्थ्य समस्या: ${patientData.healthIssue || 'N/A'}
    - समस्या की अवधि: ${patientData.duration || 'N/A'}
    - तीव्रता: ${patientData.severity || 'N/A'}/10
    - शहर: ${patientData.city || 'N/A'}
    - मूल क्वेरी: ${patientData.query || 'N/A'}
    `;
  }

  forwardToClient(sessionId, message) {
    // This will be called by the main server to forward messages to WebSocket clients
    if (this.clientMessageHandler) {
      this.clientMessageHandler(sessionId, message);
    }
  }

  setClientMessageHandler(handler) {
    this.clientMessageHandler = handler;
  }

  async endConversation(sessionId) {
    const conversation = this.conversations.get(sessionId);
    if (conversation) {
      if (conversation.agentWebSocket) {
        conversation.agentWebSocket.close();
      }
      conversation.isActive = false;
      this.conversations.delete(sessionId);
    }
  }

  getConversation(sessionId) {
    return this.conversations.get(sessionId);
  }

  async getConversationStatus(sessionId) {
    const conversation = this.conversations.get(sessionId);
    if (!conversation) return null;

    return {
      sessionId,
      isActive: conversation.isActive,
      currentQuestion: conversation.currentQuestionId,
      patientData: conversation.patientData,
      createdAt: conversation.createdAt
    };
  }
}

module.exports = { ElevenLabsAgent };