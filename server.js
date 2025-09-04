const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const cors = require("cors");

require("dotenv").config();

const {
  handleConnection,
  transferCall,
  terminateStream,
  killAudio,
  cleanup,
  shutdown,
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

console.log("  🔗 WebSocket Server created:", wss);

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// WebSocket handler now uses direct imports - no initialization needed
console.log("✅ WebSocket handler ready with direct service imports");

// WebSocket connection logging
wss.on("connection", (ws, req) => {
  console.log("🚨 WEBSOCKET CONNECTION RECEIVED! 🚨");
  console.log("URL:", req.url);
  console.log("Time:", new Date().toISOString());

  // Log ALL incoming messages on this connection
  ws.on("message", (message) => {
    console.log("📥 RAW MESSAGE RECEIVED:");
    console.log("  📍 URL:", req.url);
    console.log("  📝 Message:", message.toString());
    console.log("  🔢 Length:", message.length);
    console.log("  📊 Type:", typeof message);
    console.log("  🕐 Time:", new Date().toISOString());
  });

  ws.on("close", () => {
    console.log("❌ Connection closed:", req.url);
  });

  ws.on("error", (error) => {
    console.log("💥 Connection error:", req.url, error.message);
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

// Add test endpoint to verify server is working
app.get("/test-ws", (req, res) => {
  res.send(`
    <html>
    <body>
      <h2>WebSocket Test</h2>
      <div id="status">Connecting...</div>
      <div id="logs"></div>
      <script>
        const ws = new WebSocket('${
          req.protocol === "https" ? "wss" : "ws"
        }://${req.get("host")}/knowlarity-stream/test-browser-connection');
        const status = document.getElementById('status');
        const logs = document.getElementById('logs');
        
        ws.onopen = () => {
          status.textContent = 'Connected!';
          logs.innerHTML += '<div>✅ WebSocket Connected</div>';
        };
        
        ws.onmessage = (event) => {
          logs.innerHTML += '<div>📥 Received: ' + event.data + '</div>';
        };
        
        ws.onerror = (error) => {
          status.textContent = 'Error!';
          logs.innerHTML += '<div>❌ Error: ' + error + '</div>';
        };
        
        ws.onclose = () => {
          status.textContent = 'Closed!';
          logs.innerHTML += '<div>❌ Connection Closed</div>';
        };
      </script>
    </body>
    </html>
  `);
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
  killAudio,
};
