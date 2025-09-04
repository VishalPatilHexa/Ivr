const { getConnection, updateConnection } = require('../websocket/connectionManager');

/**
 * Process initial metadata from Knowlarity
 */
async function processInitialMetadata(metadataMessage, sessionId) {
  try {
    console.log(`📋 Processing metadata for session: ${sessionId}`);

    // Parse metadata (handle single quotes format)
    const rawMetadata = metadataMessage.toString();
    console.log('📥 Raw metadata received:', rawMetadata);
    console.log('📏 Raw metadata length:', rawMetadata.length);
    console.log('🔍 First 100 chars:', rawMetadata.substring(0, 100));
    
    const metadata = parseKnowlarityMetadata(rawMetadata);
    console.log('📊 Parsed Metadata:', JSON.stringify(metadata, null, 2));

    // Validate required fields
    validateMetadata(metadata);

    // Update connection with metadata
    const connection = getConnection(sessionId);
    if (connection) {
      updateConnection(sessionId, {
        clientType: determineClientType(metadata),
        knowlarityMetadata: {
          raw: rawMetadata,
          parsed: metadata,
          callid: metadata.callid,
          virtual_number: metadata.virtual_number,
          customer_number: metadata.customer_number,
          metadata: metadata.metadata,
          decodedMetadata: metadata.decodedMetadata
        }
      });
    }

    // Send acknowledgment
    await sendAcknowledgment(connection, sessionId);

    return { success: true, metadata };

  } catch (error) {
    console.error('❌ Failed to process metadata:', error.message);
    await sendErrorResponse(getConnection(sessionId), error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Parse Knowlarity metadata format
 */
function parseKnowlarityMetadata(rawMetadata) {
  try {
    console.log('🔧 Starting metadata parsing...');
    
    // Clean up the raw metadata - remove any leading/trailing whitespace and BOM
    let cleanMetadata = rawMetadata.trim();
    
    // Remove BOM (Byte Order Mark) if present
    if (cleanMetadata.charCodeAt(0) === 0xFEFF) {
      cleanMetadata = cleanMetadata.slice(1);
      console.log('🧹 Removed BOM from metadata');
    }
    
    console.log('🧼 Cleaned metadata:', cleanMetadata);
    console.log('🔤 Cleaned metadata first char code:', cleanMetadata.charCodeAt(0));
    
    // Try parsing as JSON first (in case it's already proper JSON)
    try {
      const directParse = JSON.parse(cleanMetadata);
      console.log('✅ Direct JSON parse successful');
      
      // Check if the result is a string (double-encoded JSON)
      if (typeof directParse === 'string') {
        console.log('🔄 Result is a string, parsing again...');
        const secondParse = JSON.parse(directParse.replace(/'/g, '"'));
        return processMetadataObject(secondParse);
      }
      
      return processMetadataObject(directParse);
    } catch (directError) {
      console.log('❌ Direct JSON parse failed:', directError.message);
    }
    
    // Handle the single quote format from Knowlarity
    console.log('🔄 Attempting single quote replacement...');
    const jsonString = cleanMetadata.replace(/'/g, '"');
    console.log('📝 After quote replacement:', jsonString);
    
    const metadata = JSON.parse(jsonString);
    console.log('✅ Single quote replacement successful');
    
    return processMetadataObject(metadata);
    
  } catch (error) {
    console.error('❌ All parsing attempts failed:', error.message);
    console.error('🔍 Raw input was:', JSON.stringify(rawMetadata));
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
      console.log('📊 Decoded inner metadata:', metadata.decodedMetadata);
    } catch (error) {
      console.warn('⚠️ Failed to decode inner metadata:', error.message);
      metadata.decodedMetadata = null;
    }
  }
  
  return metadata;
}

/**
 * Determine client type from metadata
 */
function determineClientType(metadata) {
  if (metadata.callid) return 'knowlarity';
  if (metadata.type === 'web_client_connection') return 'web_client';
  return 'unknown';
}

/**
 * Validate metadata structure
 */
function validateMetadata(metadata) {
  const requiredFields = ['callid', 'virtual_number', 'customer_number'];
  const missingFields = requiredFields.filter(field => !metadata[field]);
  
  if (missingFields.length > 0) {
    console.warn(`⚠️ Missing metadata fields: ${missingFields.join(', ')}`);
  }
}

/**
 * Send acknowledgment to Knowlarity
 */
async function sendAcknowledgment(connection, sessionId) {
  if (!connection?.websocket || connection.websocket.readyState !== 1) {
    throw new Error('WebSocket not available for acknowledgment');
  }

  const ackMessage = JSON.stringify({
    type: "metadata_received",
    status: "success",
    message: "Metadata processed successfully"
  });

  connection.websocket.send(ackMessage);
  console.log('📤 Sent acknowledgment to Knowlarity');
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
    message: errorMessage
  });

  connection.websocket.send(errorResponse);
  console.log('📤 Sent error response to Knowlarity');
}

module.exports = {
  processInitialMetadata,
  parseKnowlarityMetadata,
  processMetadataObject,
  determineClientType,
  validateMetadata,
  sendAcknowledgment,
  sendErrorResponse,
};