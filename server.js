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

// WebSocket connection handling
wss.on("connection", (ws, req) => {
  handleConnection(ws, req);
});

// WebSocket server error handling
wss.on("error", (error) => {
  console.error("❌ WebSocket Server Error:", error);
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
  cleanup();
  server.close();
});

process.on("SIGINT", () => {
  cleanup();
  server.close();
});
