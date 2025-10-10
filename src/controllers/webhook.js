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

    // Extract session information
    const { sessionId, conversationId } =
      dataExtractor.extractSessionInfo(webhookData);

    console.log("🎯 Processing webhook", { sessionId, conversationId });

    // Extract ElevenLabs data
    const elevenLabsExtracted =
      dataExtractor.extractElevenLabsData(webhookData);

    // Extract and filter transcript (only keep role and message)
    const rawTranscript = webhookData.data?.transcript || [];
    const transcript = rawTranscript.map((item) => ({
      role: item.role,
      message: item.message,
    }));

    const transcriptSummary =
      webhookData.data?.analysis?.transcript_summary || "";

    // Prepare update data with cleanValues, transcript and summary
    const updateData = {
      extractedJson: {
        ...elevenLabsExtracted.cleanValues,
        transcript: transcript,
        transcriptSummary: transcriptSummary,
      },
      status: CALL_STATUS.COMPLETED,
    };

    // Update call record
    await updateCallRecord(sessionId, updateData);

    // Handle connection cleanup
    const connection = sessionUtils.getConnection(sessionId, activeConnections);
    if (connection) {
      sessionCleanup.handleConnectionCleanup(
        connection,
        sessionId,
        cleanupSession
      );
    }

    console.log("✅ Webhook processed", { sessionId });

    // Respond to ElevenLabs
    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      sessionId,
    });
  } catch (error) {
    console.error("❌ Webhook error:", error.message);

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
