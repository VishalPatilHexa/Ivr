/**
 * ===============================================================================
 * ELEVENLABS WEBHOOK ROUTES
 * ===============================================================================
 * 
 * Routes for handling ElevenLabs post-call webhooks
 */

const express = require('express');
const router = express.Router();
const { handlePostCallWebhook } = require('../controllers/elevenLabsWebhookController');

/**
 * POST /api/webhook/elevenlabs/post-call
 * Handle ElevenLabs post-call webhook
 */
router.post('/api/webhook/elevenlabs/post-call', handlePostCallWebhook);

/**
 * GET /api/webhook/elevenlabs/health
 * Health check for webhook endpoint
 */
router.get('/api/webhook/elevenlabs/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ElevenLabs webhook endpoint is healthy',
    timestamp: new Date().toISOString(),
    service: 'elevenlabs-webhook'
  });
});

module.exports = router;