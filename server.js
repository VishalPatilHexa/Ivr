const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const cors = require("cors");

require("dotenv").config();

// Services
const { ElevenLabsAgent } = require("./services/elevenLabsAgent");
const { MCPServer } = require("./mcp/mcpServer");
const { OutboundCallManager } = require("./src/knowlarity/outboundCallManager");
const { ElevenLabsTwilioService } = require("./services/elevenLabsTwilioService");
const WebSocketHandler = require("./src/services/websocketHandler");

// Controllers
const AnalyticsController = require("./src/controllers/analyticsController");
const OutboundCallController = require("./src/controllers/outboundCallController");
const ElevenLabsController = require("./src/controllers/elevenLabsController");

// Routes
const setupRoutes = require("./src/routes");

const app = express();

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize services
const elevenLabsAgent = new ElevenLabsAgent();
const mcpServer = new MCPServer();
const outboundCallManager = new OutboundCallManager();
const elevenLabsTwilioService = new ElevenLabsTwilioService();
const websocketHandler = new WebSocketHandler(elevenLabsAgent, outboundCallManager);

// Initialize controllers
const analyticsController = new AnalyticsController(mcpServer);
const outboundCallController = new OutboundCallController(outboundCallManager);
const elevenLabsController = new ElevenLabsController(elevenLabsTwilioService);

// Setup routes
setupRoutes(app, {
  analyticsController,
  outboundCallController,
  elevenLabsController
});

// WebSocket handling
wss.on("connection", (ws, req) => {
  websocketHandler.handleConnection(ws, req);
});

// Cleanup function for expired sessions
setInterval(() => {
  websocketHandler.cleanup();
}, 5 * 60 * 1000); // Check every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  websocketHandler.shutdown();
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  websocketHandler.shutdown();
  server.close(() => {
    console.log("Process terminated");
  });
});