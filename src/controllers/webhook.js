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
const { callTestWebhook, mapElevenLabsToWebhook } = require("../services/testWebhook");
const { updateCallWithElevenLabsData } = require("../services/outboundCall");

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

    // Get Knowlarity metadata from stored connection
    const connection = activeConnections.get(sessionId);

    if (connection) {

      // Prepare combined data for webhook
      const elevenLabsData = {
        Timestamp: new Date().toISOString(),
        SessionID: sessionId,
        ConversationID: conversationId,
        TranscriptSummary:
          elevenLabsCompleteData.analysis?.transcript_summary || "",
        AllCollectedData: allCollectedData,
        DataExtractedByAI: allCollectedData,
      };

      console.log("🔗 ===== ELEVENLABS DATA FOR WEBHOOK =====");
      console.log(JSON.stringify(elevenLabsData, null, 2));

      // Update call record with extracted ElevenLabs data
      try {
        console.log("📝 Updating call record with ElevenLabs data...");
        await updateCallWithElevenLabsData(sessionId, elevenLabsData);
        console.log("✅ Call record updated successfully");
      } catch (error) {
        console.error("❌ Failed to update call record", {
          sessionId,
          error: error.message,
        });
      }

      // Map ElevenLabs data to webhook format and call external API
      try {
        const webhookPayload = mapElevenLabsToWebhook(elevenLabsData);
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

      // Close Knowlarity WebSocket if still active (agent ended call but Knowlarity socket still open)
      if (connection.websocket && connection.websocket.readyState === 1) {
        // WebSocket.OPEN = 1
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

      // Handle case without Knowlarity metadata
      const elevenLabsOnlyData = {
        Timestamp: new Date().toISOString(),
        SessionID: sessionId,
        ConversationID: conversationId,
        RecordingURL: recordingUrl,
        TranscriptSummary:
          elevenLabsCompleteData.analysis?.transcript_summary || "",
        KnowlarityRawMetadata: "",
        PhoneCallMetadata: "",
        AllDynamicVariables: allDynamicVariables,
        AllCollectedData: allCollectedData,
        DataExtractedByAI: allCollectedData,
      };

      console.log("📊 ===== ELEVENLABS DATA ONLY =====");
      console.log(JSON.stringify(elevenLabsOnlyData, null, 2));

      // Map ElevenLabs data to webhook format and call external API
      try {
        const webhookPayload = mapElevenLabsToWebhook(elevenLabsOnlyData);
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
