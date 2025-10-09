/**
 * ===============================================================================
 * ACEPHONE METADATA PROCESSOR
 * ===============================================================================
 *
 * Handles parsing and processing of Acephone call metadata
 */

const Logger = require("../../../utils/logger");
const { safeExtract } = require("../shared/utils");

/**
 * Extract metadata from Acephone start event
 * Acephone sends metadata in the 'start' event under customParameters
 */
function extractMetadata(startData) {
  try {
    const metadata = startData?.customParameters?.metadata || {};

    Logger.info("📋 Processing Acephone metadata", {
      hasMetadata: !!metadata,
      agentId: metadata?.agentId,
      sessionId: metadata?.sessionId,
    });

    return {
      success: true,
      metadata: {
        // Core identifiers
        sessionId: metadata.sessionId,
        agentId: metadata.agentId,
        streamSid: startData?.streamSid,
        callSid: startData?.callSid,
        accountSid: startData?.accountSid,

        // Call information
        from: startData?.from,
        to: startData?.to,
        direction: startData?.direction,

        // Custom parameters
        treatmentType: metadata.treatmentType,
        language: metadata.language,

        // Media format
        mediaFormat: startData?.mediaFormat,

        // Full custom parameters (for extensibility)
        customParameters: startData?.customParameters,
      },
    };
  } catch (error) {
    Logger.error("❌ Failed to extract Acephone metadata", {
      error: error.message,
    });
    return {
      success: false,
      error: error.message,
      metadata: null,
    };
  }
}

/**
 * Extract agentId from metadata with fallback paths
 */
function extractAgentId(metadata) {
  return safeExtract(
    metadata,
    "customParameters.metadata.agentId",
    "metadata.agentId",
    "agentId",
    "agent_id"
  );
}

/**
 * Extract sessionId from metadata with fallback paths
 */
function extractSessionId(metadata) {
  return safeExtract(
    metadata,
    "customParameters.metadata.sessionId",
    "metadata.sessionId",
    "sessionId",
    "session_id"
  );
}

/**
 * Extract treatment type from metadata
 */
function extractTreatmentType(metadata) {
  return safeExtract(
    metadata,
    "customParameters.metadata.treatmentType",
    "metadata.treatmentType",
    "treatmentType",
    "treatment_type"
  );
}

/**
 * Extract language from metadata
 */
function extractLanguage(metadata) {
  return safeExtract(
    metadata,
    "customParameters.metadata.language",
    "metadata.language",
    "language",
    "lang"
  ) || "en"; // Default to English
}

/**
 * Validate Acephone metadata has required fields
 */
function validateMetadata(metadata) {
  const errors = [];

  if (!metadata.streamSid) {
    errors.push("Missing streamSid");
  }

  if (!metadata.callSid) {
    errors.push("Missing callSid");
  }

  if (!metadata.sessionId) {
    errors.push("Missing sessionId in customParameters");
  }

  if (!metadata.agentId) {
    errors.push("Missing agentId in customParameters");
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

/**
 * Build ElevenLabs metadata structure from Acephone metadata
 * Converts Acephone format to format expected by ElevenLabs
 */
function buildElevenLabsMetadata(acephoneMetadata) {
  const customParams = acephoneMetadata.customParameters?.metadata || {};

  return {
    metadata: {
      metadata: customParams,
    },
  };
}

module.exports = {
  extractMetadata,
  extractAgentId,
  extractSessionId,
  extractTreatmentType,
  extractLanguage,
  validateMetadata,
  buildElevenLabsMetadata,
  safeExtract, // Re-export from shared/utils for convenience
};
