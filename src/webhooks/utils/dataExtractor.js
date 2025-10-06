/**
 * ===============================================================================
 * WEBHOOK DATA EXTRACTOR
 * ===============================================================================
 *
 * Reusable utilities for extracting and processing data from webhook payloads
 */

const Logger = require("../../utils/logger");
const { extractCleanValues } = require("../../utils/elevenLabsExtractor");

/**
 * Extract session information from webhook data
 */
function extractSessionInfo(webhookData) {
  try {
    const conversationId = webhookData.data?.conversation_id;
    const sessionId =
      webhookData.data?.conversation_initiation_client_data?.dynamic_variables
        ?.user_id || conversationId;

    return {
      conversationId,
      sessionId,
    };
  } catch (error) {
    Logger.error("❌ Failed to extract session info", { error: error.message });
    return {
      conversationId: null,
      sessionId: null,
    };
  }
}

/**
 * Extract ElevenLabs complete data from webhook
 */
function extractElevenLabsData(webhookData) {
  try {
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

    // Extract only clean values for storage
    const extractedValues = extractCleanValues(elevenLabsCompleteData);

    return {
      complete: elevenLabsCompleteData,
      collected: allCollectedData,
      cleanValues: extractedValues,
    };
  } catch (error) {
    Logger.error("❌ Failed to extract ElevenLabs data", {
      error: error.message,
    });
    return {
      complete: {},
      collected: {},
      cleanValues: {},
    };
  }
}

/**
 * Build standardized ElevenLabs data object for processing
 */
function buildElevenLabsDataObject(sessionId, conversationId, elevenLabsData) {
  return {
    Timestamp: new Date().toISOString(),
    SessionID: sessionId,
    ConversationID: conversationId,
    TranscriptSummary:
      elevenLabsData.complete.analysis?.transcript_summary || "",
    ExtractedValues: elevenLabsData.cleanValues,
  };
}

/**
 * Extract call record metadata
 */
async function getCallRecordMetadata(sessionId, dbModel) {
  try {
    const callRecord = await dbModel.findOne({
      where: { sessionId: sessionId },
    });

    if (callRecord) {
      Logger.info("📋 Call record found", {
        sessionId,
        id: callRecord.dataValues.id,
      });

      return callRecord;
    }

    Logger.warn("⚠️ No call record found", { sessionId });
    return null;
  } catch (error) {
    Logger.error("❌ Failed to fetch call record", {
      sessionId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Extract connection from activeConnections map
 */
function getActiveConnection(sessionId, activeConnections) {
  const connection = activeConnections.get(sessionId);

  if (!connection) {
    Logger.warn("⚠️ No active connection found", { sessionId });
    Logger.info("💡 This is normal - cleanup may have already happened");
  }

  return connection;
}

module.exports = {
  extractSessionInfo,
  extractElevenLabsData,
  buildElevenLabsDataObject,
  getCallRecordMetadata,
  getActiveConnection,
};
