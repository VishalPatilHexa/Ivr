/**
 * ===============================================================================
 * ELEVENLABS WEBHOOK CONTROLLER
 * ===============================================================================
 *
 * Handles post-call webhooks from ElevenLabs and manages session cleanup
 * Maps ElevenLabs conversation data with Knowlarity metadata
 */
const { CALL_STATUS } = require("../constants");
const {
  activeConnections,
  cleanupSession,
} = require("../websockets/events/stream");
const { updateCallRecord } = require("../services/outboundCall");
const db = require("../models");

// Webhook utilities
const dataExtractor = require("../webhooks/utils/dataExtractor");
const payloadMapper = require("../webhooks/utils/payloadMapper");
const httpClient = require("../webhooks/utils/httpClient");
const sessionCleanup = require("../webhooks/utils/sessionCleanup");
/**
 * Handle ElevenLabs post-call webhook
 */
async function handlePostCallWebhook(req, res) {
  try {
    const webhookData = req.body;

    console.log("🎯 ===== ELEVENLABS POST-CALL WEBHOOK RECEIVED =====");

    // Extract session information using utility
    const { sessionId, conversationId } =
      dataExtractor.extractSessionInfo(webhookData);

    console.log("🔍 Processing webhook for session:", sessionId);

    // Extract ElevenLabs data using utility
    const elevenLabsExtracted =
      dataExtractor.extractElevenLabsData(webhookData);

    // Get active connection using utility
    const connection = dataExtractor.getActiveConnection(
      sessionId,
      activeConnections
    );

    // Build standardized ElevenLabs data object using utility
    const elevenLabsData = dataExtractor.buildElevenLabsDataObject(
      sessionId,
      conversationId,
      elevenLabsExtracted
    );
    // Fetch call record using utility
    const callRecord = await dataExtractor.getCallRecordMetadata(
      sessionId,
      db.ivr_calls
    );

    // Update call record with extracted data using utility
    await sessionCleanup.updateCallRecordWithData(
      sessionId,
      elevenLabsExtracted.cleanValues,
      updateCallRecord,
      CALL_STATUS.COMPLETED
    );

    // Map ElevenLabs data to webhook format and call external API
    try {
      console.log("🔍 Mapping ElevenLabs data to webhook format", {
        elevenLabsData,
        callRecordMetadata: callRecord.metadata,
        id: callRecord.dataValues.id,
        sessionId,
      });
      // here i am able to get callRecord details its printable but see logs i showed

      // Map to webhook payload using utility
      const webhookPayload = payloadMapper.mapElevenLabsToWebhook(
        elevenLabsData,
        callRecord
      );
      console.log("📦 Mapped webhook payload:", webhookPayload);

      // Call external webhook using utility
      const webhookResult = await httpClient.callHexaHealthWebhook(
        webhookPayload
      );

      console.log("🎯 External webhook called successfully", {
        sessionId,
        success: webhookResult.success,
      });
    } catch (error) {
      console.error("❌ Failed to call external webhook", {
        sessionId,
        error: error.message,
      });
    }

    // Handle connection cleanup using utility
    console.log("🧹 Performing session cleanup after webhook processing");
    sessionCleanup.handleConnectionCleanup(
      connection,
      sessionId,
      cleanupSession
    );

    console.log("🎯 ===== END ELEVENLABS WEBHOOK PROCESSING =====");

    // Respond to ElevenLabs webhook
    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      sessionId: sessionId,
    });
  } catch (error) {
    console.error("❌ Error processing ElevenLabs webhook:", error);
    console.error("💥 Error details:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to process webhook",
      details: error.message,
    });
  }
}

module.exports = {
  handlePostCallWebhook,
};
