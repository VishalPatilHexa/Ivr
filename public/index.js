class HexahealthElevenLabsClient {
  constructor() {
    this.ws = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isConnected = false;
    this.sessionId = null;
    this.conversationActive = false;
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlayingAudio = false;

    this.initializeElements();
    this.setupEventListeners();
    this.setupAudioContext();
  }

  async setupAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log("🎵 Audio context initialized");
    } catch (error) {
      console.error("❌ Audio context setup failed:", error);
    }
  }

  initializeElements() {
    this.connectBtn = document.getElementById("connectBtn");
    this.startRecordingBtn = document.getElementById("startRecordingBtn");
    this.stopRecordingBtn = document.getElementById("stopRecordingBtn");
    this.sendTextBtn = document.getElementById("sendTextBtn");
    this.textInput = document.getElementById("textInput");
    this.conversation = document.getElementById("conversation");
    this.recordingIndicator = document.getElementById("recordingIndicator");
    this.statusText = document.getElementById("statusText");
    this.connectionStatus = document.getElementById("connectionStatus");
    this.stepIndicator = document.getElementById("stepIndicator");
    this.patientQuery = document.getElementById("patientQuery");
    this.voiceSelect = document.getElementById("voiceSelect");
    
    // Remove voice select since ElevenLabs agent handles this
    if (this.voiceSelect) {
      this.voiceSelect.style.display = 'none';
    }
  }

  setupEventListeners() {
    this.connectBtn.addEventListener("click", () => this.toggleConnection());
    this.startRecordingBtn.addEventListener("click", () => this.startRecording());
    this.stopRecordingBtn.addEventListener("click", () => this.stopRecording());
    this.sendTextBtn.addEventListener("click", () => this.sendTextMessage());
    this.textInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.sendTextMessage();
      }
    });
  }

  toggleConnection() {
    if (this.isConnected) {
      this.disconnect();
    } else {
      this.connect();
    }
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.updateConnectionStatus("Connected");
      this.connectBtn.textContent = "Disconnect";
      this.startRecordingBtn.disabled = false;
      this.textInput.disabled = false;
      this.sendTextBtn.disabled = false;

      // Start conversation with ElevenLabs agent
      this.startConversation();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.conversationActive = false;
      this.updateConnectionStatus("Disconnected");
      this.connectBtn.textContent = "Connect";
      this.startRecordingBtn.disabled = true;
      this.stopRecordingBtn.disabled = true;
      this.textInput.disabled = true;
      this.sendTextBtn.disabled = true;
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.updateConnectionStatus("Error");
    };
  }

  disconnect() {
    if (this.ws) {
      // End conversation first
      if (this.conversationActive) {
        this.ws.send(JSON.stringify({
          type: "end-conversation"
        }));
      }
      this.ws.close();
    }
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  startConversation() {
    const query = this.patientQuery.value || "general treatment";

    this.ws.send(JSON.stringify({
      type: "start-conversation",
      query: query
    }));
  }

  handleMessage(data) {
    switch (data.type) {
      case "conversation-started":
        this.sessionId = data.sessionId;
        this.conversationActive = true;
        this.updateStepIndicator("Conversation started with ElevenLabs agent");
        this.addMessage("system", "✅ Connected to ElevenLabs agent. Waiting for agent to start...");
        break;

      case "agent_ready":
        this.addMessage("system", "🤖 Agent is ready! Triggering conversation...");
        this.updateStepIndicator("Agent is ready - conversation starting");
        break;

      case "agent_audio":
        // Handle streaming audio chunks from ElevenLabs agent
        if (data.audio) {
          console.log("🔊 Received agent audio chunk");
          this.playAudioChunk(data.audio);
        }
        break;

      case "agent_audio_end":
        // Agent finished speaking
        console.log("✅ Agent finished speaking");
        this.updateStepIndicator("Agent finished speaking - you can respond now");
        break;

      case "agent_response":
        // Handle agent text response
        if (data.text) {
          this.addMessage("ai", data.text, data.audio);
        }
        if (data.audio) {
          this.playAudio(data.audio);
        }
        break;

      case "user_transcript":
        // Display transcribed user message
        this.addMessage("user", data.text);
        break;

      case "user-message":
        // Display user message
        this.addMessage("user", data.text);
        break;

      case "conversation-ended":
        this.conversationActive = false;
        this.addMessage("system", "🔚 Conversation ended. Thank you!");
        this.updateStepIndicator("Conversation completed");
        break;

      case "conversation-data":
        // Display conversation data
        this.displayConversationData(data.data);
        break;

      case "error":
        this.addMessage("system", `❌ Error: ${data.message}`);
        console.error("Server error:", data.message);
        break;

      default:
        console.log("Unknown message type:", data.type, data);
    }
  }

  addMessage(type, text, audio) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;

    const textDiv = document.createElement("div");
    textDiv.textContent = text;
    messageDiv.appendChild(textDiv);

    if (audio) {
      const audioDiv = document.createElement("div");
      audioDiv.className = "audio-player";
      const audioElement = document.createElement("audio");
      audioElement.controls = true;
      audioElement.src = `data:audio/mpeg;base64,${audio}`;
      audioDiv.appendChild(audioElement);
      messageDiv.appendChild(audioDiv);
    }

    const timestampDiv = document.createElement("div");
    timestampDiv.className = "timestamp";
    timestampDiv.textContent = new Date().toLocaleTimeString();
    messageDiv.appendChild(timestampDiv);

    this.conversation.appendChild(messageDiv);
    this.conversation.scrollTop = this.conversation.scrollHeight;
  }

  playAudio(base64Audio) {
    try {
      const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
      audio.play().catch(error => {
        console.error("Error playing audio:", error);
      });
    } catch (error) {
      console.error("Error creating audio element:", error);
    }
  }

  async playAudioChunk(base64Audio) {
    try {
      console.log("🎵 Playing audio chunk, size:", base64Audio.length);
      
      // Resume audio context if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Try simple audio playback first
      const audio = new Audio();
      audio.src = `data:audio/wav;base64,${base64Audio}`;
      
      audio.onloadeddata = () => {
        console.log("✅ Audio chunk loaded successfully");
      };
      
      audio.onerror = (error) => {
        console.error("❌ Audio chunk error:", error);
        // Try PCM conversion as fallback
        this.playPCMAudio(base64Audio);
      };
      
      audio.play().catch(error => {
        console.error("Error playing audio chunk:", error);
        // Try PCM conversion as fallback
        this.playPCMAudio(base64Audio);
      });
      
    } catch (error) {
      console.error("Error processing audio chunk:", error);
      // Try PCM conversion as fallback
      this.playPCMAudio(base64Audio);
    }
  }

  async playPCMAudio(base64Audio) {
    try {
      // ElevenLabs sends PCM 16kHz data, we need to create a proper WAV header
      const pcmData = atob(base64Audio);
      const pcmArray = new Int16Array(pcmData.length / 2);
      
      for (let i = 0; i < pcmArray.length; i++) {
        const byte1 = pcmData.charCodeAt(i * 2);
        const byte2 = pcmData.charCodeAt(i * 2 + 1);
        pcmArray[i] = (byte2 << 8) | byte1;
      }

      // Create WAV file with proper header
      const wavBuffer = this.createWavFile(pcmArray, 16000);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio();
      audio.src = audioUrl;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.play().catch(error => {
        console.error("Error playing PCM audio:", error);
      });
      
    } catch (error) {
      console.error("Error processing PCM audio:", error);
    }
  }

  createWavFile(pcmData, sampleRate) {
    const length = pcmData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // PCM data
    for (let i = 0; i < length; i++) {
      view.setInt16(44 + i * 2, pcmData[i], true);
    }
    
    return buffer;
  }

  updateConnectionStatus(status) {
    this.statusText.textContent = status;
    const statusIndicator = this.connectionStatus;

    if (status === "Connected") {
      statusIndicator.classList.add("connected");
    } else {
      statusIndicator.classList.remove("connected");
    }
  }

  updateStepIndicator(message) {
    this.stepIndicator.textContent = message;
    this.stepIndicator.style.display = "block";
  }

  async startRecording() {
    if (!this.conversationActive) {
      alert("Please start a conversation first.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      // Use AudioContext for direct PCM processing
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 16000 
      });
      
      const source = this.audioContext.createMediaStreamSource(stream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Convert float32 to int16 PCM
        const int16Array = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        
        // Convert to base64 and send
        const uint8Array = new Uint8Array(int16Array.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Data = btoa(binary);
        
        // Send PCM data directly
        this.sendPCMChunk(base64Data);
      };
      
      source.connect(processor);
      processor.connect(this.audioContext.destination);
      
      this.audioProcessor = processor;
      this.audioSource = source;
      this.recordingStream = stream;
      
      this.isRecording = true;
      this.startRecordingBtn.disabled = true;
      this.stopRecordingBtn.disabled = false;
      this.recordingIndicator.classList.add("active");
      
      console.log("🎙️ Started recording with direct PCM processing");
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Unable to access microphone. Please check permissions.");
    }
  }

  stopRecording() {
    if (this.isRecording) {
      // Stop AudioContext processing
      if (this.audioProcessor) {
        this.audioProcessor.disconnect();
        this.audioSource.disconnect();
      }
      
      // Stop media stream
      if (this.recordingStream) {
        this.recordingStream.getTracks().forEach(track => track.stop());
      }
      
      // Close audio context
      if (this.audioContext) {
        this.audioContext.close();
      }
      
      this.isRecording = false;
      this.startRecordingBtn.disabled = false;
      this.stopRecordingBtn.disabled = true;
      this.recordingIndicator.classList.remove("active");
      
      console.log("🎙️ Stopped recording");
    }
  }

  sendPCMChunk(base64Data) {
    if (!this.conversationActive) return;

    try {
      this.ws.send(JSON.stringify({
        type: "audio-chunk",
        audio: base64Data
      }));
    } catch (error) {
      console.error("Error sending PCM chunk:", error);
    }
  }

  async sendAudioChunk(audioBlob) {
    if (!this.conversationActive) return;

    try {
      // Convert WebM to PCM for ElevenLabs
      const arrayBuffer = await audioBlob.arrayBuffer();
      const pcmData = await this.convertWebMToPCM(arrayBuffer);
      
      if (pcmData) {
        this.ws.send(JSON.stringify({
          type: "audio-chunk",
          audio: pcmData,
          isChunk: true
        }));
      }
    } catch (error) {
      console.error("Error sending audio chunk:", error);
    }
  }

  async convertWebMToPCM(webmBuffer) {
    try {
      // Create audio context for conversion
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
        sampleRate: 16000 
      });
      
      // Decode WebM audio
      const audioBuffer = await audioContext.decodeAudioData(webmBuffer);
      
      // Get PCM data (16-bit, 16kHz, mono)
      const pcmData = audioBuffer.getChannelData(0);
      
      // Convert float32 to int16
      const int16Array = new Int16Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        int16Array[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
      }
      
      // Convert to base64
      const uint8Array = new Uint8Array(int16Array.buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      
      await audioContext.close();
      return btoa(binary);
      
    } catch (error) {
      console.error("Error converting WebM to PCM:", error);
      return null;
    }
  }

  async sendFinalAudioMessage(audioBlob) {
    if (!this.conversationActive) {
      alert("No active conversation.");
      return;
    }

    try {
      // Convert WebM to PCM for ElevenLabs
      const arrayBuffer = await audioBlob.arrayBuffer();
      const pcmData = await this.convertWebMToPCM(arrayBuffer);
      
      if (pcmData) {
        this.ws.send(JSON.stringify({
          type: "audio-chunk",
          audio: pcmData,
          isFinal: true
        }));
        
        console.log("🎙️ Sent final audio message");
      }
    } catch (error) {
      console.error("Error sending final audio:", error);
    }
  }

  async sendAudioMessage(audioBlob) {
    // This is the fallback method
    await this.sendFinalAudioMessage(audioBlob);
  }

  sendTextMessage() {
    const text = this.textInput.value.trim();
    if (text && this.conversationActive) {
      this.ws.send(JSON.stringify({
        type: "text-message",
        text: text
      }));

      this.textInput.value = "";
    } else if (!this.conversationActive) {
      alert("Please start a conversation first.");
    }
  }

  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  displayConversationData(data) {
    if (!data) return;

    const dataDiv = document.createElement("div");
    dataDiv.className = "conversation-data";
    dataDiv.innerHTML = `
      <h3>Conversation Summary</h3>
      <p><strong>Session ID:</strong> ${data.sessionId}</p>
      <p><strong>Status:</strong> ${data.isActive ? 'Active' : 'Completed'}</p>
      <p><strong>Current Question:</strong> ${data.currentQuestion}</p>
      <p><strong>Started:</strong> ${new Date(data.createdAt).toLocaleString()}</p>
      <div class="patient-data">
        <h4>Patient Information:</h4>
        <pre>${JSON.stringify(data.patientData, null, 2)}</pre>
      </div>
    `;

    this.conversation.appendChild(dataDiv);
    this.conversation.scrollTop = this.conversation.scrollHeight;
  }

  // Additional utility methods
  getConversationData() {
    if (this.conversationActive && this.sessionId) {
      this.ws.send(JSON.stringify({
        type: "get-conversation-data"
      }));
    }
  }

  endConversation() {
    if (this.conversationActive) {
      this.ws.send(JSON.stringify({
        type: "end-conversation"
      }));
    }
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  const client = new HexahealthElevenLabsClient();
  
  // Add additional controls to the UI
  const additionalControls = document.createElement("div");
  additionalControls.className = "additional-controls";
  additionalControls.innerHTML = `
    <button id="getDataBtn" class="btn btn-primary">Get Conversation Data</button>
    <button id="endConversationBtn" class="btn btn-danger">End Conversation</button>
  `;
  
  document.querySelector('.controls').appendChild(additionalControls);
  
  // Add event listeners for additional controls
  document.getElementById('getDataBtn').addEventListener('click', () => {
    client.getConversationData();
  });
  
  document.getElementById('endConversationBtn').addEventListener('click', () => {
    client.endConversation();
  });
  
  // Make client globally accessible for debugging
  window.hexahealthClient = client;
});