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
