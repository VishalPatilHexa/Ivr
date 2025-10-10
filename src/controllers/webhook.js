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
const { updateCallRecord, getCallRecordBySessionId } = require("../services/outboundCall");
const sessionUtils = require("../websockets/events/shared/session");

// Webhook utilities
const dataExtractor = require("../webhooks/utils/dataExtractor");
const sessionCleanup = require("../webhooks/utils/sessionCleanup");
/**
 * Handle ElevenLabs post-call webhook
 */
async function handlePostCallWebhook(req, res) {
  try {
    const webhookData = req.body;

    console.log("🎯 ===== ELEVENLABS POST-CALL WEBHOOK RECEIVED =====", webhookData);

    // Extract session information using utility
    const { sessionId, conversationId } =
      dataExtractor.extractSessionInfo(webhookData);

    console.log("🔍 Processing webhook for session:", sessionId);

    // Extract ElevenLabs data using utility
    const elevenLabsExtracted =
      dataExtractor.extractElevenLabsData(webhookData);

      console.log("📊 Extracted ElevenLabs data:", elevenLabsExtracted);
      

    // Get active connection using session utility
    const connection = sessionUtils.getConnection(sessionId, activeConnections);

    // Build standardized ElevenLabs data object using utility
    const elevenLabsData = dataExtractor.buildElevenLabsDataObject(
      sessionId,
      conversationId,
      elevenLabsExtracted
    );

    // Fetch call record from database service
    const callRecord = await getCallRecordBySessionId(sessionId);

    // Update call record with extracted data using utility
    await sessionCleanup.updateCallRecordWithData(
      sessionId,
      elevenLabsExtracted.cleanValues,
      updateCallRecord,
      CALL_STATUS.COMPLETED
    );
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
