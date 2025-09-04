const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const cors = require("cors");

// Load configuration
const config = require("./config");

// Import core modules
const { handleConnection } = require("./core/websocket/router");
const { cleanupDeadConnections } = require("./core/websocket/connectionManager");

// Import routes
const routes = require("./routes");

const app = express();

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/", routes);

// Static files
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log("✅ WebSocket server initialized");

// WebSocket connection handler
wss.on("connection", handleConnection);

// WebSocket server error handling
wss.on("error", (error) => {
  console.error("❌ WebSocket Server Error:", error);
});

// Periodic cleanup of dead connections
setInterval(() => {
  cleanupDeadConnections();
}, config.session.cleanupInterval);

// Start server
const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

function handleShutdown() {
  console.log("SIGINT/SIGTERM received, shutting down gracefully");
  
  // Close WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });
  
  // Close server
  server.close(() => {
    console.log("Process terminated");
  });
}

module.exports = app;