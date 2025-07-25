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

// Simple ElevenLabs webhook endpoints with signature validation
app.post(
  "/webhooks/elevenlabs",
  express.raw({ type: "application/json" }),
  (req, res) => {
    console.log("🔥 ELEVENLABS WEBHOOK RECEIVED 🔥");
    console.log("📋 Headers:", req.headers);
    console.log("📦 Raw Body Size:", req.body.length, "bytes");
    
    // Check for signature validation
    const signature = req.headers['xi-signature'];
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;
    
    console.log("🔐 Signature provided:", !!signature);
    console.log("🔐 Secret configured:", !!webhookSecret);
    
    if (signature && webhookSecret) {
      console.log("🔐 VALIDATING WEBHOOK SIGNATURE 🔐");
      console.log("📋 Signature header:", signature);
      
      try {
        const crypto = require('crypto');
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(req.body)
          .digest('hex');
        
        const providedSignature = signature.replace('sha256=', '');
        
        console.log("🔐 Expected signature:", expectedSignature);
        console.log("🔐 Provided signature:", providedSignature);
        
        const isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(providedSignature, 'hex')
        );
        
        if (!isValid) {
          console.log("❌ SIGNATURE VALIDATION FAILED");
          return res.status(401).json({ error: 'Invalid signature' });
        }
        
        console.log("✅ SIGNATURE VALIDATION PASSED");
      } catch (error) {
        console.log("❌ Signature validation error:", error.message);
        return res.status(401).json({ error: 'Signature validation failed' });
      }
    } else {
      console.log("⚠️ No signature validation (signature or secret missing)");
    }

    console.log("📦 Raw Body:", req.body.toString());

    try {
      const data = JSON.parse(req.body);
      console.log("📄 Webhook Type:", data.webhook_type);
      console.log("📄 Conversation ID:", data.conversation_id);
      console.log("📄 Parsed Data:", JSON.stringify(data, null, 2));
    } catch (error) {
      console.log("❌ Could not parse JSON:", error.message);
    }

    res.status(200).json({ status: "received" });
  }
);

// app.post(
//   "/webhooks/elevenlabs/audio",
//   express.raw({ type: "application/json" }),
//   (req, res) => {
//     console.log("🔥 ELEVENLABS AUDIO WEBHOOK RECEIVED 🔥");
//     console.log("📋 Headers:", req.headers);
//     console.log("📦 Body Size:", req.body.length, "bytes");

//     try {
//       const data = JSON.parse(req.body);
//       console.log("🎵 Audio Data Keys:", Object.keys(data));
//       console.log("🎵 Conversation ID:", data.conversation_id);
//       console.log(
//         "🎵 Audio Size:",
//         data.audio_base_64?.length || 0,
//         "characters"
//       );
//     } catch (error) {
//       console.log("❌ Could not parse JSON:", error.message);
//     }

//     res.status(200).json({ status: "received" });
//   }
// );

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// WebSocket handler now uses direct imports - no initialization needed
console.log("✅ WebSocket handler ready with direct service imports");

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
  console.log(
    `🔗 WebSocket URL: ws://localhost:${PORT}/knowlarity-stream/{sessionId}`
  );
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
