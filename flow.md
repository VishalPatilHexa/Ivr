# HexaHealth IVR Audio Streaming Flow

This document describes the complete audio streaming flow between Knowlarity/Web Clients, Server, and ElevenLabs AI Agent.

## 🏗️ **System Architecture**

```
[Knowlarity Call] ←→ [WebSocket Server] ←→ [ElevenLabs Agent]
[Web Browser]    ←→ [WebSocket Server] ←→ [ElevenLabs Agent]
```

## 📞 **Connection Flow**

### 1. WebSocket Connection Establishment

#### **Knowlarity Calls:**
```
Knowlarity → wss://stream.hexahealth.com/knowlarity-stream/{sessionId}
├── Function: handleConnection() [websocketHandler.js:47]
├── Function: handleKnowlarityStream() [websocketHandler.js:68]
├── Connection Type: 'knowlarity' (detected from sessionId)
└── Storage: activeConnections.set(sessionId, {websocket, clientType: 'knowlarity'})
```

#### **Web Browser Calls:**
```
Browser → ws://localhost:3000/knowlarity-stream/web_{timestamp}_{random}
├── Function: handleConnection() [websocketHandler.js:47]
├── Function: handleKnowlarityStream() [websocketHandler.js:68]
├── Connection Type: 'web_client' (detected from 'web_' prefix)
└── Storage: activeConnections.set(sessionId, {websocket, clientType: 'web_client'})
```

### 2. Initial Metadata Exchange

#### **Knowlarity Metadata (First Message):**
```
Format: JSON Text Frame
{
  "ivr_data": "{\"client_data\": \"hexahealth_ivr\", \"client_custom_id\": \"sessionId\"}",
  "callid": "sessionId",
  "virtual_number": "+918035469861",
  "customer_number": "customer_phone",
  "client_meta_id": "sessionId",
  "event_timestamp": 1234567890
}

Flow:
├── Function: handleInitialMetadata() [websocketHandler.js:331]
├── Client Type: Confirmed as 'knowlarity'
├── Session Creation: Temporary external session
└── Status Update: 'connected'
```

#### **Web Client Metadata (First Message):**
```
Format: JSON Text Frame
{
  "type": "web_client_connection",
  "sessionId": "web_1234567890_abc123",
  "patientData": {
    "source": "web_client",
    "treatmentType": "Heart Surgery",
    "timestamp": "2025-07-24T17:29:42.915Z"
  }
}

Flow:
├── Function: handleInitialMetadata() [websocketHandler.js:331]
├── Client Type: Updated to 'web_client'
├── Session Creation: Temporary external session
└── Status Update: 'connected'
```

## 🤖 **ElevenLabs Agent Initialization**

### 3. Agent Setup
```
Server Side:
├── Function: initializeAgentConversation() [websocketHandler.js:105]
├── Function: elevenLabsAgentService.createConversation() [elevenLabsAgent.js:59]
├── WebSocket: wss://api.elevenlabs.io/v1/convai/conversation?agent_id={agentId}
├── Function: setupAudioStreaming() [websocketHandler.js:218]
├── Callback Registration: setClientMessageHandler() [elevenLabsAgent.js:461]
└── Client Notification: {"type": "agent_ready", "message": "ElevenLabs agent is ready"}
```

### 4. Agent Ready Response
```
ElevenLabs → Server → Client:
├── Message Type: 'conversation_initiation_metadata'
├── Function: handleConversationReady() [elevenLabsAgent.js:328]
├── Auto Greeting: {"user_text": "Hi"} sent to ElevenLabs
└── Agent Response: Initial greeting in Hindi
```

## 🎵 **Audio Streaming Flow**

### 5. Incoming Audio (User → Agent)

#### **From Knowlarity:**
```
Audio Type: Binary PCM (16-bit, 16kHz)
Direction: Knowlarity → Server → ElevenLabs

Flow:
├── Receive: Binary PCM frames (after metadata)
├── Function: handleIncomingAudio() [websocketHandler.js:335]
├── Convert: audioBuffer.toString('base64')
├── Function: sendAudioToAgent() [elevenLabsAgent.js:368]
├── Format: {"user_audio_chunk": "base64_pcm_data"}
└── Send: ElevenLabs WebSocket
```

#### **From Web Browser:**
```
Audio Type: JSON with base64 PCM
Direction: Browser → Server → ElevenLabs

Flow:
├── Receive: {"type": "audio-chunk", "audio": "base64_pcm_data"}
├── Function: JSON parsing in message handler [websocketHandler.js:166]
├── Function: handleIncomingAudio() [websocketHandler.js:335]
├── Function: sendAudioToAgent() [elevenLabsAgent.js:368]
├── Format: {"user_audio_chunk": "base64_pcm_data"}
└── Send: ElevenLabs WebSocket
```

### 6. Outgoing Audio (Agent → User)

#### **ElevenLabs Response Processing:**
```
ElevenLabs Agent Response:
├── Message Type: 'audio' or 'agent_response_audio_delta'
├── Function: handleElevenLabsMessage() [elevenLabsAgent.js:160]
├── Function: handleAgentAudioChunk() [elevenLabsAgent.js:262]
├── Function: forwardToClient() [elevenLabsAgent.js:436]
└── Callback Execution: setupAudioStreaming callback
```

#### **To Knowlarity:**
```
Audio Type: JSON playAudio format
Direction: ElevenLabs → Server → Knowlarity

Format:
{
  "type": "playAudio",
  "data": {
    "audioContentType": "raw",
    "sampleRate": 16000,
    "audioContent": "base64_pcm_data"
  }
}

Flow:
├── Client Detection: connection.clientType === 'knowlarity'
├── Function: setupAudioStreaming callback [websocketHandler.js:221]
├── Audio Saving: saveAudioChunk() [websocketHandler.js:410]
└── Send: JSON.stringify(knowlarityAudioMessage)
```

#### **To Web Browser:**
```
Audio Type: Binary PCM
Direction: ElevenLabs → Server → Browser

Flow:
├── Client Detection: connection.clientType === 'web_client'
├── Function: setupAudioStreaming callback [websocketHandler.js:221]
├── Convert: Buffer.from(agentMessage.audio, 'base64')
├── Send: Binary buffer to WebSocket
└── Browser: playBinaryAudio() → playRawPCMAudio() [index.js:318]
```

## 📱 **Browser Audio Handling**

### 7. Browser Audio Playback
```
Received Audio Processing:
├── Function: onmessage handler [index.js:110]
├── Detection: Binary data (ArrayBuffer/Blob)
├── Function: playBinaryAudio() [index.js:318]
├── Try: AudioContext.decodeAudioData()
├── Fallback: playRawPCMAudio() [index.js:374]
├── Format: 16-bit PCM → Float32 conversion
└── Playback: Web Audio API
```

### 8. Browser Audio Recording
```
Recording Flow:
├── Function: startRecording() [index.js:470]
├── MediaDevices: getUserMedia({echoCancellation: true})
├── MediaRecorder: Start with 'audio/webm' format
├── Function: sendAudioChunk() [index.js:519]
├── Convert: WebM → PCM via convertWebMToPCM()
├── Format: {"type": "audio-chunk", "audio": "base64_pcm"}
└── Send: WebSocket to server
```

## 🔄 **Control Flow Messages**

### 9. Knowlarity Control Messages

#### **Call Transfer:**
```
Format: {"type": "transfer", "data": {"textContent": "+918770915486"}}
Function: transferCall() [websocketHandler.js:679]
Direction: Server → Knowlarity
```

#### **Stream Termination:**
```
Format: {"type": "disconnect"}
Function: terminateStream() [websocketHandler.js:699]
Direction: Server → Knowlarity
```

#### **Audio Stop:**
```
Format: {"type": "killAudio"}
Function: killAudio() [websocketHandler.js:715]
Direction: Server → Knowlarity
```

### 10. Browser Control Messages

#### **Agent Ready:**
```
Format: {"type": "agent_ready", "message": "ElevenLabs agent is ready"}
Function: handleMessage() case "agent_ready" [index.js:177]
Action: Enable recording button, set conversationActive = true
```

#### **Agent Response Text:**
```
Format: {"type": "agent_response", "text": "नमस्ते, मैं भावना..."}
Function: handleMessage() case "agent_response" [index.js:226]
Action: Display text in conversation UI
```

## 🧹 **Session Cleanup Flow**

### 11. Connection Cleanup
```
Cleanup Triggers:
├── WebSocket Close Event
├── ElevenLabs Connection Lost
├── Manual Termination

Cleanup Functions:
├── cleanupSession() [websocketHandler.js:636]
├── saveSessionAudioToFile() [websocketHandler.js:515]
├── endConversation() [elevenLabsAgent.js:476]
├── activeConnections.delete(sessionId)
└── Audio file generation (.pcm, .wav)
```

## 📊 **Audio Format Summary**

| Source | Direction | Format | Function |
|--------|-----------|--------|----------|
| Knowlarity → Server | Incoming | Binary PCM (16-bit, 16kHz) | handleIncomingAudio() |
| Browser → Server | Incoming | JSON + Base64 PCM | JSON parsing + handleIncomingAudio() |
| Server → ElevenLabs | Outgoing | JSON + Base64 PCM | sendAudioToAgent() |
| ElevenLabs → Server | Incoming | JSON + Base64 PCM | handleAgentAudioChunk() |
| Server → Knowlarity | Outgoing | JSON playAudio + Base64 PCM | setupAudioStreaming() |
| Server → Browser | Outgoing | Binary PCM | setupAudioStreaming() |

## 🔗 **Key Integration Points**

### Message Forwarding Bridge:
```
Location: setupAudioStreaming() [websocketHandler.js:218]
Purpose: Connects ElevenLabs responses to client connections
Mechanism: Callback registration via setClientMessageHandler()
```

### Client Type Detection:
```
Initial: sessionId prefix ('web_' vs others)
Updated: Metadata analysis (ivr_data vs type field)
Storage: activeConnections[sessionId].clientType
```

### Echo Prevention:
```
Browser: Stop recording when agent audio received
Server: Turn-taking via agent_audio_end messages
Timing: 500ms delay before re-enabling recording
```

## 🔄 **Complete Flow Diagram**

### Simple Flow (Original):
```
1. Knowlarity connects → handleConnection() → handleKnowlarityStream()
   ↓
2. Store connection → getCallSession() → activeConnections.set()
   ↓
3. Initialize agent → createConversation() → createElevenLabsWebSocket()
   ↓
4. Setup audio bridge → setupAudioStreaming() → setClientMessageHandler()
   ↓
5. Handle metadata → handleInitialMetadata() → handleCallStatusUpdate()
   ↓
6. AUDIO LOOP:
   Caller audio → handleIncomingAudio() → sendAudioToAgent()
   ↓
   Agent processes → handleElevenLabsMessage() → handleAgentAudioChunk()
   ↓
   Agent audio → forwardToClient() → callback → websocket.send()
   ↓
7. Control events → handleControlMessages() → handleCallStatusUpdate()
   ↓
8. Connection ends → setupConnectionLifecycle() → cleanupSession()
```

### Detailed Architecture:
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Knowlarity    │    │  WebSocket      │    │  ElevenLabs     │
│     Call        │    │    Server       │    │    Agent        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         │ WSS Connection         │                        │
         ├───────────────────────►│                        │
         │                        │ Create Conversation    │
         │                        ├───────────────────────►│
         │                        │                        │
         │ JSON Metadata          │                        │
         ├───────────────────────►│                        │
         │                        │ Setup Audio Bridge     │
         │                        │◄──────────────────────►│
         │                        │                        │
         │ Binary Audio (PCM)     │ Base64 Audio          │
         ├───────────────────────►├───────────────────────►│
         │                        │                        │
         │                        │ Agent Response         │
         │ JSON playAudio         │◄───────────────────────┤
         │◄───────────────────────┤                        │
         │                        │                        │
```

## 🚀 **Performance Considerations**

- **Audio Buffering**: Minimal buffering for real-time feel
- **Format Conversion**: Efficient PCM ↔ Base64 conversion
- **Connection Pooling**: Single WebSocket per session
- **Memory Management**: Automatic cleanup after call completion
- **Error Recovery**: Graceful handling of connection drops

## 📝 **Logging Points**

All major functions include detailed logging for:
- Connection establishment and client type detection
- Audio message routing and format conversion
- ElevenLabs communication status
- Error conditions and recovery attempts
- Performance metrics (audio chunk sizes, timing)
