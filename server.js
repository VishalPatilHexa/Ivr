const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const cors = require("cors");

require("dotenv").config();

const {
  handleConnection,
  cleanup,
} = require("./src/services/websocketHandler");

// Import routes
const routes = require("./src/routes");

const app = express();

// CORS configuration
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use routes
app.use(routes);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));


// WebSocket connection logging  
wss.on("connection", (ws, req) => {

  // Log ALL incoming messages on this connection
  ws.on("message", (message) => {
    console.log("📥📥📥 RAW MESSAGE RECEIVED 📥📥📥");
  });

  ws.on("close", (code, reason) => {
    console.log("❌❌❌ CONNECTION CLOSED ❌❌❌");
  });

  ws.on("error", (error) => {
    console.log("💥💥💥 CONNECTION ERROR 💥💥💥");
  });

  handleConnection(ws, req);
});


// WebSocket server error handling
wss.on("error", (error) => {
  console.error("❌ WebSocket Server Error:", error);
});

// Add more detailed server events
wss.on("headers", (headers, req) => {
  console.log("📋 WebSocket headers event:", req.url);
});

// Log when server starts listening
wss.on("listening", () => {
  console.log("👂 WebSocket Server is listening for connections");
});


// Cleanup function for expired sessions
setInterval(() => {
  cleanup();
}, 5 * 60 * 1000); // Check every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});
