const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

const app = require("./src/app");
const config = require("./src/config");
const Logger = require("./src/utils/logger");
const {
  handleConnection,
  cleanup,
} = require("./src/websockets/events/stream");

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on("connection", (ws, req) => {
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
  Logger.info(`Environment: ${config.nodeEnv}`);
  Logger.info(`API Base URL: http://localhost:${PORT}/api/v1`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  Logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    Logger.info('HTTP server closed');
    cleanup();
    process.exit(0);
  });

  // Force close server after 10 seconds
  setTimeout(() => {
    Logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
