const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const cors = require("cors");

require("dotenv").config();

// Import function-based services
const { 
  createConversation,
  sendAudioToAgent,
  setClientMessageHandler,
  endConversation 
} = require("./services/elevenLabsAgent");

const { 
  getCallSession,
  handleCallStatusUpdate 
} = require("./src/knowlarity/outboundCallManager");

const { 
  initializeWebSocketHandler,
  handleConnection,
  transferCall,
  terminateStream,
  killAudio,
  cleanup,
  shutdown
} = require("./src/services/websocketHandler");

// Import routes
const routes = require("./src/routes");

const app = express();

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use routes
app.use(routes);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize WebSocket handler with dependencies
// Create simple wrapper objects for backward compatibility
const elevenLabsAgentWrapper = {
  createConversation,
  sendAudioToAgent,
  setClientMessageHandler,
  endConversation
};

const outboundCallManagerWrapper = {
  getCallSession,
  handleCallStatusUpdate
};

initializeWebSocketHandler(elevenLabsAgentWrapper, outboundCallManagerWrapper);

// WebSocket handling
wss.on("connection", (ws, req) => {
  handleConnection(ws, req);
});

// Cleanup function for expired sessions
setInterval(() => {
  cleanup();
}, 5 * 60 * 1000); // Check every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 WebSocket URL: ws://localhost:${PORT}/knowlarity-stream/{sessionId}`);
  console.log(`📋 Health Check: http://localhost:${PORT}/health`);
  console.log(`📞 Outbound Call API: http://localhost:${PORT}/api/outbound-call`);
  console.log(`🤖 ElevenLabs API: http://localhost:${PORT}/api/elevenlabs/call`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  shutdown();
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  shutdown();
  server.close(() => {
    console.log("Process terminated");
  });
});

// Export functions for external control (if needed)
module.exports = {
  transferCall,
  terminateStream,
  killAudio
};