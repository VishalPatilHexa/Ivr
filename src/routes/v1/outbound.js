/**
 * ===============================================================================
 * OUTBOUND CALL ROUTES
 * ===============================================================================
 *
 * API endpoints for making outbound calls through different providers
 */

const express = require("express");
const router = express.Router();
const outboundCallController = require("../../controllers/outboundCall");

/**
 * POST /call
 * Initiate an outbound call
 */
router.post("/call", outboundCallController.makeOutboundCall);

/**
 * GET /provider-info
 * Get current provider configuration
 */
router.get("/provider-info", outboundCallController.getProviderInfo);

/**
 * POST /test
 * Test endpoint for debugging
 */
router.post("/test", outboundCallController.testOutboundCall);

module.exports = router;
