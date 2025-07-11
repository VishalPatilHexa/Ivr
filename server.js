const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require('uuid');

require("dotenv").config();

const { ElevenLabsAgent } = require("./services/elevenLabsAgent");
const { MCPServer } = require("./mcp/mcpServer");
const { OutboundCallManager } = require("./src/knowlarity/outboundCallManager");
const { TwilioService } = require("./services/twilioService");
const { ElevenLabsTwilioService } = require("./services/elevenLabsTwilioService");

const app = express();

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize services
const elevenLabsAgent = new ElevenLabsAgent();
const mcpServer = new MCPServer();
const outboundCallManager = new OutboundCallManager();
const twilioService = new TwilioService();
const elevenLabsTwilioService = new ElevenLabsTwilioService();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add this for form data parsing
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Multer for file uploads
const upload = multer({ dest: "uploads/" });

// Store client WebSocket connections
const clients = new Map();
// Store Knowlarity call connections
const knowlarityConnections = new Map();

// Set up client message handler for ElevenLabs agent
elevenLabsAgent.setClientMessageHandler((sessionId, message) => {
  const client = clients.get(sessionId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    services: {
      elevenLabs: !!process.env.ELEVENLABS_API_KEY,
      mcp: true
    }
  });
});

// Get MCP analytics
app.get("/analytics", async (req, res) => {
  try {
    const analytics = await mcpServer.executeTool('get_conversation_analytics', {
      timeRange: req.query.timeRange || 'all'
    });
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export patient data
app.get("/export", async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const sessionIds = req.query.sessionIds ? req.query.sessionIds.split(',') : null;
    
    const exportData = await mcpServer.executeTool('export_patient_data', {
      format,
      sessionIds
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="patient_data.csv"');
      res.send(exportData.data);
    } else {
      res.json(exportData);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation status
app.get("/conversation/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = await elevenLabsAgent.getConversationStatus(sessionId);
    
    if (!status) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Outbound call API endpoints
app.post("/api/outbound-call", async (req, res) => {
  try {
    console.log('📥 Received request body:', JSON.stringify(req.body, null, 2));
    
    const { patientData } = req.body;
    
    console.log('📋 Patient data extracted:', patientData);
    
    // Validate required fields
    if (!patientData || !patientData.phoneNumber || !patientData.name) {
      console.log('❌ Validation failed:');
      console.log('- patientData exists:', !!patientData);
      console.log('- phoneNumber exists:', patientData?.phoneNumber);
      console.log('- name exists:', patientData?.name);
      
      return res.status(400).json({ 
        error: "Patient data with phoneNumber and name is required",
        received: req.body
      });
    }
    
    // Initiate outbound call
    const result = await outboundCallManager.initiateOutboundCall(patientData);
    
    res.json({
      success: true,
      message: "Outbound call initiated successfully",
      data: result
    });
    
  } catch (error) {
    console.error("Error initiating outbound call:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to initiate outbound call"
    });
  }
});

// Get call status
app.get("/api/outbound-call/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callSession = outboundCallManager.getCallSession(sessionId);
    
    if (!callSession) {
      return res.status(404).json({ error: "Call session not found" });
    }
    
    res.json(callSession);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all active calls
app.get("/api/outbound-calls", async (req, res) => {
  try {
    const activeCalls = outboundCallManager.getActiveCalls();
    const stats = outboundCallManager.getCallStats();
    
    res.json({
      activeCalls,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle call status updates from Knowlarity
app.post("/api/knowlarity/webhook", async (req, res) => {
  try {
    const { call_session_id, status, ...statusData } = req.body;
    
    if (!call_session_id) {
      return res.status(400).json({ error: "call_session_id is required" });
    }
    
    // Update call status
    outboundCallManager.handleCallStatusUpdate(call_session_id, {
      status,
      ...statusData
    });
    
    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    console.error("Error handling call status update:", error);
    res.status(500).json({ error: error.message });
  }
});

// Callback endpoint for Knowlarity makecall API
app.post("/callback", async (req, res) => {
  try {
    console.log('📞 Knowlarity callback received:', JSON.stringify(req.body, null, 2));
    
    const { call_id, status, caller_id, customer_number, ...callData } = req.body;
    
    // Find the call session by phone number or call_id
    const activeCalls = outboundCallManager.getActiveCalls();
    const callSession = activeCalls.find(call => 
      call.patientData.phoneNumber === customer_number || 
      call.knowlarityCallId === call_id
    );
    
    if (callSession) {
      outboundCallManager.handleCallStatusUpdate(callSession.sessionId, {
        status,
        knowlarityCallId: call_id,
        ...callData
      });
    }
    
    res.json({ success: true, message: "Callback processed" });
  } catch (error) {
    console.error("Error handling Knowlarity callback:", error);
    res.status(500).json({ error: error.message });
  }
});

// Twilio Voice webhook endpoints
app.post("/twilio/voice", async (req, res) => {
  try {
    console.log('📞 Twilio voice webhook called');
    console.log('📞 Request headers:', req.headers);
    console.log('📞 Request body:', req.body);
    
    // Generate ElevenLabs audio first
    const message = "Hello, this is HexaHealth calling about your appointment. How can I help you today?";
    console.log('📞 Generating ElevenLabs audio...');
    
    const audioId = await twilioService.generateAndStoreAudio(message);
    console.log('📞 Generated audio ID:', audioId);
    
    // Generate TwiML - if no audio ID, fallback to regular TTS
    let twiml;
    if (audioId) {
      twiml = await twilioService.generateTwiMLWithElevenLabs(message, audioId);
    } else {
      console.log('📞 Falling back to regular TTS');
      twiml = await twilioService.generateTwiML(message);
    }
    
    console.log('📞 Generated TwiML:', twiml);
    
    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    console.error('❌ Error handling Twilio voice webhook:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Send a simple TwiML response as fallback
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is HexaHealth calling about your appointment. How can I help you today?</Say>
  <Gather input="speech" action="/twilio/process-speech" method="POST" speechTimeout="auto">
    <Say voice="alice">Please speak your response</Say>
  </Gather>
</Response>`;
    
    res.type('text/xml');
    res.send(fallbackTwiml);
  }
});

// Add a simple GET endpoint for testing
app.get("/twilio/voice", (req, res) => {
  console.log('📞 GET request to webhook endpoint');
  res.json({ message: "Webhook endpoint is accessible", timestamp: new Date().toISOString() });
});

// Serve ElevenLabs audio to Twilio
app.get("/twilio/audio/:audioId", (req, res) => {
  try {
    const { audioId } = req.params;
    
    console.log('🔊 Audio request for ID:', audioId);
    console.log('🔊 Available audio IDs:', global.audioStorage ? Array.from(global.audioStorage.keys()) : 'none');
    
    if (!global.audioStorage || !global.audioStorage.has(audioId)) {
      console.log('❌ Audio not found:', audioId);
      return res.status(404).send('Audio not found');
    }
    
    const audioData = global.audioStorage.get(audioId);
    
    console.log('🔊 Serving audio, size:', audioData.buffer.length, 'bytes');
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioData.buffer.length,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes'
    });
    
    res.send(audioData.buffer);
  } catch (error) {
    console.error('❌ Error serving audio:', error);
    res.status(500).send('Error serving audio');
  }
});

app.post("/twilio/process-speech", async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult;
    const callSid = req.body.CallSid;
    
    console.log('🎤 Speech received:', speechResult);
    
    // Generate response message
    const responseMessage = `Thank you for saying: ${speechResult}. Is there anything else I can help you with?`;
    
    // Generate ElevenLabs audio for response
    const audioId = await twilioService.generateAndStoreAudio(responseMessage);
    
    // Generate TwiML with ElevenLabs audio
    const response = await twilioService.generateTwiMLWithElevenLabs(responseMessage, audioId);
    
    console.log('🎤 Generated speech response TwiML');
    
    res.type('text/xml');
    res.send(response);
  } catch (error) {
    console.error('Error processing speech:', error);
    res.status(500).send('Error processing speech');
  }
});

// Twilio SMS webhook
app.post("/twilio/sms", async (req, res) => {
  try {
    const { From, Body } = req.body;
    console.log(`SMS received from ${From}: ${Body}`);
    
    // Process SMS and send response
    await twilioService.sendSMS(From, `Thank you for your message: ${Body}`);
    
    res.status(200).send('SMS processed');
  } catch (error) {
    console.error('Error handling SMS:', error);
    res.status(500).send('Error processing SMS');
  }
});

// ElevenLabs Twilio API endpoints
app.post("/api/elevenlabs/call", async (req, res) => {
  try {
    const { to, agentPhoneNumberId, conversationData } = req.body;
    
    if (!to) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    const result = await elevenLabsTwilioService.makeOutboundCall(to, agentPhoneNumberId, conversationData);
    
    res.json({
      success: true,
      ...result,
      message: "ElevenLabs call initiated successfully"
    });
  } catch (error) {
    console.error('Error making ElevenLabs call:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/elevenlabs/phone-numbers", async (req, res) => {
  try {
    const phoneNumbers = await elevenLabsTwilioService.getPhoneNumbers();
    res.json(phoneNumbers);
  } catch (error) {
    console.error('Error fetching phone numbers:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/elevenlabs/configure-phone", async (req, res) => {
  try {
    const { phoneNumber, twilioAccountSid, twilioAuthToken, label } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    const result = await elevenLabsTwilioService.configurePhoneNumber(
      phoneNumber, 
      twilioAccountSid, 
      twilioAuthToken,
      label
    );
    
    res.json({
      success: true,
      ...result,
      message: "Phone number configured successfully"
    });
  } catch (error) {
    console.error('Error configuring phone number:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/elevenlabs/agent-info", async (req, res) => {
  try {
    const agentInfo = await elevenLabsTwilioService.getAgentInfo();
    res.json(agentInfo);
  } catch (error) {
    console.error('Error fetching agent info:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/elevenlabs/check-access", async (req, res) => {
  try {
    const accessInfo = await elevenLabsTwilioService.checkConversationalAIAccess();
    res.json({
      success: true,
      message: "Conversational AI access confirmed",
      data: accessInfo
    });
  } catch (error) {
    console.error('Error checking conversational AI access:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy Twilio API endpoints
app.post("/api/twilio/call", async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: "Phone number and message are required" });
    }
    
    const call = await twilioService.makeCall(to, message);
    
    res.json({
      success: true,
      callSid: call.sid,
      message: "Call initiated successfully"
    });
  } catch (error) {
    console.error('Error making Twilio call:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/twilio/sms", async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: "Phone number and message are required" });
    }
    
    const sms = await twilioService.sendSMS(to, message);
    
    res.json({
      success: true,
      messageSid: sms.sid,
      message: "SMS sent successfully"
    });
  } catch (error) {
    console.error('Error sending SMS:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Check if this is a Knowlarity stream connection
  if (pathname.startsWith('/knowlarity-stream/')) {
    const callSessionId = pathname.split('/')[2];
    console.log("📞 New Knowlarity call stream connection for session:", callSessionId);
    
    // Store the Knowlarity connection
    knowlarityConnections.set(callSessionId, ws);
    
    // Get call session details
    const callSession = outboundCallManager.getCallSession(callSessionId);
    if (!callSession) {
      console.error('❌ Call session not found:', callSessionId);
      ws.close(1008, 'Call session not found');
      return;
    }
    
    // Update call status to connected
    outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'connected' });
    
    // Create ElevenLabs conversation for this call
    let elevenLabsConversation = null;
    
    const initializeElevenLabsConversation = async () => {
      try {
        elevenLabsConversation = await elevenLabsAgent.createConversation(
          callSessionId,
          callSession.patientData.treatmentType || 'general consultation'
        );
        console.log('✅ ElevenLabs conversation created for call:', callSessionId);
        
        // Set up message forwarding from ElevenLabs to Knowlarity
        elevenLabsAgent.setClientMessageHandler((sessionId, message) => {
          if (sessionId === callSessionId) {
            const knowlarityWs = knowlarityConnections.get(callSessionId);
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
          outboundCallManager.handleCallStatusUpdate(callSessionId, { 
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
            await elevenLabsAgent.sendAudioToAgent(callSessionId, audioBase64);
          }
        } else {
          // This might be a JSON control message
          try {
            const data = JSON.parse(message);
            console.log('📋 Received JSON message from Knowlarity:', data);
            
            switch (data.type) {
              case 'call_start':
                console.log('📞 Call started for session:', callSessionId);
                outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'active' });
                break;
                
              case 'call_end':
                console.log('📞 Call ended for session:', callSessionId);
                outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'completed' });
                if (elevenLabsConversation) {
                  await elevenLabsAgent.endConversation(callSessionId);
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
      knowlarityConnections.delete(callSessionId);
      if (elevenLabsConversation) {
        elevenLabsAgent.endConversation(callSessionId);
      }
      outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
    });
    
    ws.on('error', (error) => {
      console.error('❌ Knowlarity WebSocket error:', error);
      knowlarityConnections.delete(callSessionId);
      if (elevenLabsConversation) {
        elevenLabsAgent.endConversation(callSessionId);
      }
      outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'failed', reason: error.message });
    });
    
    return;
  }
  
  // Regular frontend WebSocket connection
  console.log("🔗 New WebSocket connection");
  
  let sessionId = null;
  let conversation = null;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case "start-conversation":
          // Generate unique session ID
          sessionId = uuidv4();
          clients.set(sessionId, ws);
          
          // Create conversation with ElevenLabs agent
          try {
            conversation = await elevenLabsAgent.createConversation(
              sessionId, 
              data.query || "general_treatment"
            );
            
            ws.send(JSON.stringify({
              type: "conversation-started",
              sessionId,
              message: "Conversation started with ElevenLabs agent",
              status: "active"
            }));
            
            // Let the ElevenLabs agent start the conversation naturally
            // The agent's system prompt will handle the initial greeting
            console.log("✅ Conversation created, agent will start naturally");
            
          } catch (error) {
            console.error("Error creating conversation:", error);
            ws.send(JSON.stringify({
              type: "error",
              message: "Failed to start conversation with agent: " + error.message
            }));
          }
          break;

        case "audio-chunk":
          if (!sessionId || !conversation) {
            ws.send(JSON.stringify({
              type: "error",
              message: "No active conversation"
            }));
            return;
          }

          try {
            // Send audio to ElevenLabs agent
            await elevenLabsAgent.sendAudioToAgent(sessionId, data.audio);
          } catch (error) {
            console.error("Error sending audio to agent:", error);
            ws.send(JSON.stringify({
              type: "error",
              message: "Failed to process audio"
            }));
          }
          break;

        case "text-message":
          if (!sessionId || !conversation) {
            ws.send(JSON.stringify({
              type: "error",
              message: "No active conversation"
            }));
            return;
          }

          try {
            // Send text to ElevenLabs agent
            await elevenLabsAgent.sendTextToAgent(sessionId, data.text);
            
            // Show user message in UI
            ws.send(JSON.stringify({
              type: "user-message",
              text: data.text,
              timestamp: new Date().toISOString()
            }));
            
          } catch (error) {
            console.error("Error sending text to agent:", error);
            ws.send(JSON.stringify({
              type: "error",
              message: "Failed to send text message"
            }));
          }
          break;

        case "end-conversation":
          if (sessionId && conversation) {
            try {
              await elevenLabsAgent.endConversation(sessionId);
              ws.send(JSON.stringify({
                type: "conversation-ended",
                sessionId,
                message: "Conversation ended successfully"
              }));
            } catch (error) {
              console.error("Error ending conversation:", error);
            }
          }
          break;

        case "get-conversation-data":
          if (sessionId) {
            try {
              const conversationData = await elevenLabsAgent.getConversationStatus(sessionId);
              ws.send(JSON.stringify({
                type: "conversation-data",
                sessionId,
                data: conversationData
              }));
            } catch (error) {
              console.error("Error getting conversation data:", error);
              ws.send(JSON.stringify({
                type: "error",
                message: "Failed to get conversation data"
              }));
            }
          }
          break;
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      ws.send(JSON.stringify({
        type: "error",
        message: "Invalid message format"
      }));
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket connection closed");
    if (sessionId) {
      // Clean up
      clients.delete(sessionId);
      if (conversation) {
        elevenLabsAgent.endConversation(sessionId);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    if (sessionId) {
      clients.delete(sessionId);
      if (conversation) {
        elevenLabsAgent.endConversation(sessionId);
      }
    }
  });
});

// Cleanup function for expired sessions
setInterval(() => {
  const now = Date.now();
  const sessionTimeout = 30 * 60 * 1000; // 30 minutes
  
  // Cleanup regular client connections
  clients.forEach((client, sessionId) => {
    if (client.readyState === WebSocket.CLOSED) {
      clients.delete(sessionId);
      elevenLabsAgent.endConversation(sessionId);
    }
  });
  
  // Cleanup Knowlarity connections
  knowlarityConnections.forEach((connection, callSessionId) => {
    if (connection.readyState === WebSocket.CLOSED) {
      knowlarityConnections.delete(callSessionId);
      elevenLabsAgent.endConversation(callSessionId);
      outboundCallManager.handleCallStatusUpdate(callSessionId, { status: 'disconnected' });
    }
  });
}, 5 * 60 * 1000); // Check every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  
  // Close all WebSocket connections
  clients.forEach((client, sessionId) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
    elevenLabsAgent.endConversation(sessionId);
  });
  
  // Close all Knowlarity connections
  knowlarityConnections.forEach((connection, callSessionId) => {
    if (connection.readyState === WebSocket.OPEN) {
      connection.close();
    }
    elevenLabsAgent.endConversation(callSessionId);
  });
  
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  
  // Close all WebSocket connections
  clients.forEach((client, sessionId) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
    elevenLabsAgent.endConversation(sessionId);
  });
  
  // Close all Knowlarity connections
  knowlarityConnections.forEach((connection, callSessionId) => {
    if (connection.readyState === WebSocket.OPEN) {
      connection.close();
    }
    elevenLabsAgent.endConversation(callSessionId);
  });
  
  server.close(() => {
    console.log("Process terminated");
  });
});