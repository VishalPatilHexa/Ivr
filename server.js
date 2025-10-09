const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

const app = require("./src/app");
const config = require("./src/config");
const Logger = require("./src/utils/logger");
const gracefulShutdown = require("./src/core/gracefulShutdown");
const {
  handleConnection,
  cleanup,
  activeConnections,
} = require("./src/websockets/events/stream");

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Set activeConnections reference for graceful shutdown
gracefulShutdown.setActiveConnections(activeConnections);

// WebSocket connection handling
wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection requested");
  
  handleConnection(ws, req);
});

// WebSocket server error handling
wss.on("error", (error) => {
  Logger.error("WebSocket Server Error:", error);
});

// Cleanup function for expired sessions
setInterval(() => {
  cleanup();
}, config.streaming.cleanupInterval);

const PORT = config.port;
server.listen(PORT, () => {
  Logger.success(`Server running on port ${PORT}`);
});

// Note: Graceful shutdown handlers are registered in src/app.js via gracefulShutdown.register()
