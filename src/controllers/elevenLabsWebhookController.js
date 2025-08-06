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
} = require("../services/websocketHandler");
const { addDataToSheet } = require("../services/googleSheetsService");

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

    // Extract all dynamic variables (not just predefined ones)
    const allDynamicVariables =
      elevenLabsCompleteData.conversation_initiation_client_data
        ?.dynamic_variables || {};

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

    // Recording URL from metadata
    const recordingUrl =
      elevenLabsCompleteData.metadata?.audio_url ||
      elevenLabsCompleteData.metadata?.recording_url ||
      "No recording available";

    console.log("📊 ===== ELEVENLABS COMPLETE DATA =====");
    console.log(
      "🎯 All Dynamic Variables:",
      JSON.stringify(allDynamicVariables, null, 2)
    );
    console.log(
      "📋 All Collected Data:",
      JSON.stringify(allCollectedData, null, 2)
    );
    console.log("🎵 Recording URL:", recordingUrl);
    console.log(
      "📄 Summary:",
      elevenLabsCompleteData.analysis?.transcript_summary
    );

    // Get Knowlarity metadata from stored connection
    const connection = activeConnections.get(sessionId);

    if (connection) {
      const knowlarityMetadata = connection.knowlarityMetadata || {};

      console.log("📞 ===== KNOWLARITY METADATA =====");
      console.log(
        "🔍 Raw metadata:",
        knowlarityMetadata.raw || "No metadata stored"
      );

      // Prepare combined data for Google Sheets with exact column names
      const combinedData = {
        Timestamp: new Date().toISOString(),
        SessionID: sessionId,
        ConversationID: conversationId,
        RecordingURL: recordingUrl,
        TranscriptSummary:
          elevenLabsCompleteData.analysis?.transcript_summary || "",
        KnowlarityRawMetadata: knowlarityMetadata.raw || "",
        PhoneCallMetadata: knowlarityMetadata.raw || "",
        AllDynamicVariables: allDynamicVariables,
        AllCollectedData: allCollectedData,
        DataExtractedByAI: allCollectedData
      };

      console.log("🔗 ===== COMBINED DATA FOR GOOGLE SHEETS =====");
      console.log(JSON.stringify(combinedData, null, 2));

      // Write to Google Sheets instead of external API
      await addDataToSheet(combinedData);

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

      // Still write to Google Sheets even without Knowlarity metadata
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
        DataExtractedByAI: allCollectedData
      };

      console.log("📊 ===== ELEVENLABS DATA ONLY =====");
      console.log(JSON.stringify(elevenLabsOnlyData, null, 2));

      // Write to Google Sheets
      await addDataToSheet(elevenLabsOnlyData);
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

/**
 * Call external API with combined Knowlarity and ElevenLabs data
 */
async function callExternalAPI(combinedData) {
  try {
    console.log("📡 ===== CALLING EXTERNAL API =====");
    console.log("🚀 Data to send:", JSON.stringify(combinedData, null, 2));

    // TODO: Replace with actual external API endpoint
    const externalApiUrl =
      process.env.EXTERNAL_API_URL || "https://your-api-endpoint.com/webhook";

    console.log(`📞 Would call external API: ${externalApiUrl}`);
    console.log("📦 Payload:", combinedData);

    // Uncomment below when ready to make actual API call
    /*
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXTERNAL_API_TOKEN}`
      },
      body: JSON.stringify(combinedData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ External API call successful:', result);
    } else {
      console.error('❌ External API call failed:', response.statusText);
    }
    */

    console.log("✅ External API call completed (currently mocked)");
  } catch (error) {
    console.error("❌ Error calling external API:", error);
    throw error;
  }
}

module.exports = {
  handlePostCallWebhook,
};
