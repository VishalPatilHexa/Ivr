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

  // Safely decode URL-encoded nested metadata
  if (metadata && typeof metadata === 'object' && metadata.metadata) {
    try {
      // Handle different nested metadata formats
      if (typeof metadata.metadata === 'string') {
        // URL-encoded string format
        const decodedMetadataString = decodeURIComponent(metadata.metadata);
        metadata.metadata = JSON.parse(decodedMetadataString);
        Logger.debug("✅ Decoded URL-encoded nested metadata");
      } else if (typeof metadata.metadata === 'object') {
        // Already parsed object - keep as is
        Logger.debug("✅ Nested metadata already parsed as object");
      }
    } catch (error) {
      Logger.warn("⚠️ Failed to decode nested metadata", { 
        error: error.message,
        metadataType: typeof metadata.metadata,
        metadataValue: metadata.metadata
      });
      
      // Fallback: try to parse as JSON string without URL decoding
      try {
        if (typeof metadata.metadata === 'string') {
          metadata.metadata = JSON.parse(metadata.metadata);
          Logger.debug("✅ Parsed nested metadata without URL decoding");
        }
      } catch (fallbackError) {
        Logger.error("❌ Complete failure to parse nested metadata", {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
        metadata.metadata = null;
      }
    }
  }

  // Validate final structure
  const hasValidMetadata = !!(metadata && metadata.metadata && typeof metadata.metadata === 'object');
  const hasAgentId = hasValidMetadata && !!metadata.metadata.agentId;

  Logger.info("✅ Metadata processed", {
    callid: metadata?.callid || 'unknown',
    hasNestedMetadata: hasValidMetadata,
    hasAgentId: hasAgentId,
    agentId: hasAgentId ? metadata.metadata.agentId : 'not_found'
  });

  return metadata;
}

/**
 * Safely extract nested value from metadata with multiple fallback paths
 */
function safeExtract(metadata, ...paths) {
  for (const path of paths) {
    try {
      let current = metadata;
      const parts = path.split('.');
      
      for (const part of parts) {
        if (current && typeof current === 'object' && current[part] !== undefined) {
          current = current[part];
        } else {
          current = undefined;
          break;
        }
      }
      
      if (current !== undefined) {
        return current;
      }
    } catch (error) {
      Logger.debug("Failed to extract path", { path, error: error.message });
    }
  }
  
  return undefined;
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

  const agentConfig = extractAgentConfig(metadata);
  if (!agentConfig.agentId) {
    errors.push("Missing agentId in nested metadata");
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    agentConfig: agentConfig
  };
}

module.exports = {
  processInitialMessage,
  processMetadata,
  parseKnowlarityMetadata,
  processMetadataObject,
  validateMetadata,
  safeExtract,
  extractAgentConfig,
};