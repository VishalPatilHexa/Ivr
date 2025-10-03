/**
 * ===============================================================================
 * ELEVENLABS WEBHOOK CONTROLLER
 * ===============================================================================
 *
 * Handles post-call webhooks from ElevenLabs and manages session cleanup
 * Maps ElevenLabs conversation data with Knowlarity metadata
 */

const {
  activeConnections,
  cleanupSession,
} = require("../websockets/events/stream");
const {
  callTestWebhook,
  mapElevenLabsToWebhook,
} = require("../services/testWebhook");
const { updateCallWithElevenLabsData } = require("../services/outboundCall");
const { getFields, extractCleanValues } = require("../utils/elevenLabsExtractor");
const db = require("../models");
/**
 * Handle ElevenLabs post-call webhook
 */
async function handlePostCallWebhook(req, res) {
  try {
    const webhookData = req.body;

    console.log("🎯 ===== ELEVENLABS POST-CALL WEBHOOK RECEIVED =====");

    // Extract session information from webhook
    const conversationId = webhookData.data?.conversation_id;
    const sessionId =
      webhookData.data?.conversation_initiation_client_data?.dynamic_variables
        ?.user_id || conversationId;

    console.log("🔍 Processing webhook for session:", sessionId);

    // Extract ALL ElevenLabs data (complete webhook data)
    const elevenLabsCompleteData = webhookData.data || {};

    // Extract all collected data from analysis
    const allCollectedData = {};
    if (elevenLabsCompleteData.analysis?.data_collection_results) {
      Object.keys(
        elevenLabsCompleteData.analysis.data_collection_results
      ).forEach((key) => {
        const result =
          elevenLabsCompleteData.analysis.data_collection_results[key];
        allCollectedData[key] = {
          value: result.value,
          rationale: result.rationale,
        };
      });
    }

    // Extract only clean values from DataExtractedByAI for storage
    const extractedValues = extractCleanValues(elevenLabsCompleteData);

    // Get Knowlarity metadata from stored connection
    const connection = activeConnections.get(sessionId);

    // Prepare ElevenLabs data object (same format regardless of connection)
    const elevenLabsData = {
      Timestamp: new Date().toISOString(),
      SessionID: sessionId,
      ConversationID: conversationId,
      TranscriptSummary:
        elevenLabsCompleteData.analysis?.transcript_summary || "",
      ExtractedValues: extractedValues, // Clean values only for database storage
    };
    // Fetch call record to get metadata.custom_field
    let callRecord = null;
    try {
      callRecord = await db.ivr_calls.findOne({
        where: { sessionId: sessionId },
      });
      console.log(
        "📋 Call record found:",
        !!callRecord,
        "for sessionId:",
        sessionId
      );
    } catch (error) {
      console.error("❌ Failed to fetch call record", {
        sessionId,
        error: error.message,
      });
    }

    // Update call record with extracted ElevenLabs data
    try {
      console.log("📝 Updating call record with ElevenLabs data...");
      await updateCallWithElevenLabsData(sessionId, {
        extractedJSON: extractedValues,
      });
      console.log("✅ Call record updated successfully");
    } catch (error) {
      console.error("❌ Failed to update call record", {
        sessionId,
        error: error.message,
      });
    }

    // Map ElevenLabs data to webhook format and call external API
    try {
      const webhookPayload = mapElevenLabsToWebhook(elevenLabsData, callRecord);
      const webhookResult = await callTestWebhook(webhookPayload);

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

    // Handle connection-specific cleanup (only if connection exists)
    if (connection) {
      // Close Knowlarity WebSocket if still active
      if (connection.websocket && connection.websocket.readyState === 1) {
        console.log(
          "🔌 Closing Knowlarity WebSocket - ElevenLabs agent ended the call"
        );
        connection.websocket.close(1000, "Call ended by ElevenLabs agent");
      }

      // Perform cleanup after processing
      console.log("🧹 Performing session cleanup after webhook processing");
      const agentConversation = connection.agentConversation;
      cleanupSession(sessionId, agentConversation);
    } else {
      console.log("⚠️ No connection found for session:", sessionId);
      console.log("💡 This is normal - cleanup may have already happened");
    }

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
