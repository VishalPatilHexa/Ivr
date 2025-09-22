/**
 * ===============================================================================
 * ELEVENLABS WEBHOOK ROUTES
 * ===============================================================================
 *
 * Routes for handling ElevenLabs post-call webhooks
 */

const express = require("express");
const router = express.Router();
const {
  handlePostCallWebhook,
} = require("../../controllers/webhook");

/**
 * POST /elevenlabs/post-call
 * Handle ElevenLabs post-call webhook
 * Use raw body parser for text webhooks that aren't valid JSON
 */
router.post(
  "/elevenlabs/post-call",
  express.raw({ type: "*/*" }),
  (req, res, next) => {
    // Handle non-JSON webhook data
    if (
      req.headers["content-type"] &&
      !req.headers["content-type"].includes("application/json")
    ) {
      console.log("📨 Non-JSON webhook received:", req.body.toString());
      return res
        .status(200)
        .json({ success: true, message: "Non-JSON webhook received" });
    }

    // Try to parse JSON body if it's not already parsed
    if (Buffer.isBuffer(req.body)) {
      try {
        const bodyStr = req.body.toString();
        console.log("📨 Raw webhook body:", bodyStr);
        req.body = JSON.parse(bodyStr);
      } catch (error) {
        console.error("❌ JSON parse error:", error.message);
        console.log("📨 Raw body that failed parsing:", req.body.toString());
        return res.status(400).json({ success: false, error: "Invalid JSON" });
      }
    }

    next();
  },
  handlePostCallWebhook
);

/**
 * GET /elevenlabs/health
 * Health check for webhook endpoint
 */
router.get("/elevenlabs/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ElevenLabs webhook endpoint is healthy",
    timestamp: new Date().toISOString(),
    service: "elevenlabs-webhook",
  });
});

module.exports = router;
