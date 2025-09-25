/**
 * ===============================================================================
 * KNOWLARITY METADATA PROCESSOR
 * ===============================================================================
 *
 * Handles parsing and processing of Knowlarity call metadata
 */

const Logger = require("../../../utils/logger");

/**
 * Process initial message and check for metadata
 */
async function processInitialMessage(incomingMessage, sessionId, sessionManager) {
  try {
    const messageStr = incomingMessage.toString();

    // Quick check for metadata indicators
    if (messageStr.includes("metadata") || messageStr.includes("callid")) {
      const metadata = await processMetadata(messageStr, sessionId, sessionManager);
      return metadata;
    }

    return null;
  } catch (error) {
    Logger.error("❌ Error processing initial message", { sessionId, error });
    return null;
  }
}

/**
 * Process metadata message from Knowlarity
 */
async function processMetadata(rawMetadata, sessionId, sessionManager) {
  try {
    Logger.info("📋 Processing Knowlarity metadata", { sessionId });

    // Parse the metadata
    const metadata = parseKnowlarityMetadata(rawMetadata);

    // Update session with metadata
    if (sessionManager) {
      await sessionManager.updateSession(sessionId, {
        metadata: metadata,
        status: "active_with_metadata"
      });
      Logger.info("✅ Session updated with metadata", { sessionId });
    }

    return { success: true, metadata };
  } catch (error) {
    Logger.error("❌ Failed to process metadata", { sessionId, error });
    return { success: false, error: error.message };
  }
}

/**
 * Parse Knowlarity metadata format
 */
function parseKnowlarityMetadata(rawMetadata) {
  try {
    // Clean up the raw metadata
    let cleanMetadata = rawMetadata.trim();

    // Remove BOM (Byte Order Mark) if present
    if (cleanMetadata.charCodeAt(0) === 0xfeff) {
      cleanMetadata = cleanMetadata.slice(1);
    }

    // Try parsing as JSON first
    try {
      const directParse = JSON.parse(cleanMetadata);

      // Check if the result is a string (double-encoded JSON)
      if (typeof directParse === "string") {
        const secondParse = JSON.parse(directParse.replace(/'/g, '"'));
        return processMetadataObject(secondParse);
      }

      return processMetadataObject(directParse);
    } catch (directError) {
      // Handle single quote format from Knowlarity
      const jsonString = cleanMetadata.replace(/'/g, '"');
      const metadata = JSON.parse(jsonString);
      return processMetadataObject(metadata);
    }
  } catch (error) {
    Logger.error("❌ Failed to parse metadata", error);
    throw new Error(`Failed to parse metadata: ${error.message}`);
  }
}

/**
 * Process metadata object and decode nested fields
 */
function processMetadataObject(metadata) {
  Logger.debug("📋 Processing metadata object", metadata);

  // Decode URL-encoded metadata if present
  if (metadata.metadata) {
    try {
      const decodedMetadataString = decodeURIComponent(metadata.metadata);
      metadata.metadata = JSON.parse(decodedMetadataString);
      Logger.debug("✅ Decoded nested metadata", metadata.metadata);
    } catch (error) {
      Logger.warn("⚠️ Failed to decode nested metadata", error);
      metadata.metadata = null;
    }
  }

  // Extract key information
  const processedMetadata = {
    callid: metadata.callid,
    virtual_number: metadata.virtual_number,
    customer_number: metadata.customer_number,
    metadata: metadata.metadata,
    raw: metadata,
  };

  Logger.info("✅ Metadata processed", {
    callid: processedMetadata.callid,
    hasNestedMetadata: !!processedMetadata.metadata
  });

  return processedMetadata;
}

/**
 * Validate metadata has required fields
 */
function validateMetadata(metadata) {
  const errors = [];

  if (!metadata.callid) {
    errors.push("Missing callid");
  }

  if (!metadata.customer_number) {
    errors.push("Missing customer_number");
  }

  if (metadata.metadata && !metadata.metadata.agentId) {
    errors.push("Missing agentId in nested metadata");
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

module.exports = {
  processInitialMessage,
  processMetadata,
  parseKnowlarityMetadata,
  processMetadataObject,
  validateMetadata,
};