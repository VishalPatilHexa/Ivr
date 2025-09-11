const {
  getConnection,
  updateConnection,
} = require("../websocket/connectionManager");

/**
 * Process initial metadata from Knowlarity
 */
async function processInitialMetadata(metadataMessage, sessionId) {
  try {
    console.log(`📋 Processing metadata for session: ${sessionId}`);
    
    // Parse metadata (handle single quotes format)
    const rawMetadata = metadataMessage.toString();
    const metadata = parseKnowlarityMetadata(rawMetadata);

    // Validate required fields
    validateMetadata(metadata);

    // Extract dynamic fields from decoded metadata
    const dynamicFields = extractDynamicFields(metadata);
    console.log(`🔄 Extracted dynamic fields:`, JSON.stringify(dynamicFields, null, 2));

    // Update connection with metadata
    const connection = getConnection(sessionId);
    if (connection) {
      updateConnection(sessionId, {
        clientType: determineClientType(metadata),
        knowlarityMetadata: {
          callid: metadata.callid,
          virtual_number: metadata.virtual_number,
          customer_number: metadata.customer_number,
          metadata: metadata.decodedMetadata,
          dynamicFields: dynamicFields,
        },
      });
    }

    // Send acknowledgment
    await sendAcknowledgment(connection, sessionId);

    return { success: true, metadata };
  } catch (error) {
    console.error("❌ Failed to process metadata:", error.message);
    await sendErrorResponse(getConnection(sessionId), error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Parse Knowlarity metadata format
 */
function parseKnowlarityMetadata(rawMetadata) {
  try {
    // Clean up the raw metadata - remove any leading/trailing whitespace and BOM
    let cleanMetadata = rawMetadata.trim();

    // Remove BOM (Byte Order Mark) if present
    if (cleanMetadata.charCodeAt(0) === 0xfeff) {
      cleanMetadata = cleanMetadata.slice(1);
    }

    // Try parsing as JSON first (in case it's already proper JSON)
    try {
      const directParse = JSON.parse(cleanMetadata);

      // Check if the result is a string (double-encoded JSON)
      if (typeof directParse === "string") {
        const secondParse = JSON.parse(directParse.replace(/'/g, '"'));
        return processMetadataObject(secondParse);
      }

      return processMetadataObject(directParse);
    } catch (directError) {
      // Handle the single quote format from Knowlarity
      const jsonString = cleanMetadata.replace(/'/g, '"');
      const metadata = JSON.parse(jsonString);
      return processMetadataObject(metadata);
    }
  } catch (error) {
    console.error("❌ Failed to parse metadata:", error.message);
    throw new Error(`Failed to parse metadata: ${error.message}`);
  }
}

/**
 * Process metadata object and decode inner metadata if present
 */
function processMetadataObject(metadata) {
  // Decode URL-encoded metadata if present
  if (metadata.metadata) {
    try {
      const decodedMetadataString = decodeURIComponent(metadata.metadata);
      metadata.decodedMetadata = JSON.parse(decodedMetadataString);
    } catch (error) {
      metadata.decodedMetadata = null;
    }
  }

  return metadata;
}

/**
 * Extract dynamic fields from metadata for ElevenLabs
 */
function extractDynamicFields(metadata) {
  const dynamicFields = {
    // Core call information
    callid: metadata.callid,
    virtual_number: metadata.virtual_number,
    customer_number: metadata.customer_number,
  };

  // Extract fields from decoded metadata
  if (metadata.decodedMetadata) {
    // Agent configuration
    if (metadata.decodedMetadata.agentId) {
      dynamicFields.agentId = metadata.decodedMetadata.agentId;
    }
    
    // Campaign information
    if (metadata.decodedMetadata.campaign_id) {
      dynamicFields.campaign_id = metadata.decodedMetadata.campaign_id;
    }

    // Treatment type
    if (metadata.decodedMetadata.treatmentType) {
      dynamicFields.treatmentType = metadata.decodedMetadata.treatmentType;
    }

    // Language preference
    if (metadata.decodedMetadata.language) {
      dynamicFields.language = metadata.decodedMetadata.language;
    }

    // User information
    if (metadata.decodedMetadata.user_name) {
      dynamicFields.user_name = metadata.decodedMetadata.user_name;
    }

    // Any extra parameters
    if (metadata.decodedMetadata.extra_param) {
      dynamicFields.extra_param = metadata.decodedMetadata.extra_param;
    }

    // Add any other fields from decodedMetadata
    Object.keys(metadata.decodedMetadata).forEach(key => {
      if (!dynamicFields[key]) {
        dynamicFields[key] = metadata.decodedMetadata[key];
      }
    });
  }

  return dynamicFields;
}

/**
 * Determine client type from metadata
 */
function determineClientType(metadata) {
  if (metadata.callid) return "knowlarity";
  if (metadata.type === "web_client_connection") return "web_client";
  return "unknown";
}

/**
 * Validate metadata structure
 */
function validateMetadata(metadata) {
  const requiredFields = ["callid", "virtual_number", "customer_number"];
  const missingFields = requiredFields.filter((field) => !metadata[field]);

  if (missingFields.length > 0) {
    console.warn(`⚠️ Missing metadata fields: ${missingFields.join(", ")}`);
  }
}



/**
 * Send acknowledgment to Knowlarity
 */
async function sendAcknowledgment(connection, sessionId) {
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    throw new Error("WebSocket not available for acknowledgment");
  }

  const ackMessage = JSON.stringify({
    type: "metadata_received",
    status: "success",
    message: "Metadata processed successfully",
  });

  connection.websocket.send(ackMessage);
}

/**
 * Send error response to Knowlarity
 */
async function sendErrorResponse(connection, errorMessage) {
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    return;
  }

  const errorResponse = JSON.stringify({
    type: "metadata_error",
    status: "error",
    message: errorMessage,
  });

  connection.websocket.send(errorResponse);
}

module.exports = {
  processInitialMetadata,
  parseKnowlarityMetadata,
  processMetadataObject,
  extractDynamicFields,
  determineClientType,
  validateMetadata,
  sendAcknowledgment,
  sendErrorResponse,
};
