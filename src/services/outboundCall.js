/**
 * ===============================================================================
 * OUTBOUND CALL SERVICE
 * ===============================================================================
 *
 * Unified service for making outbound calls through different providers:
 * - Knowlarity
 * - Acephone
 *
 * Provider is determined by environment configuration
 */

const axios = require("axios");
const Logger = require("../utils/logger");
const { v4: uuidv4 } = require("uuid");
const db = require("../models");
const {
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  CALL_STATUS,
  OUTBOUND_PROVIDERS,
} = require("../constants");

// Provider configurations
const PROVIDERS = {
  KNOWLARITY: {
    name: "knowlarity",
    url: "https://etsrds.kapps.in/webapi/hexahealth/api/hexahealth_voice_api",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        process.env.KNOWLARITY_API_KEY ||
        "04716f34-53ab-4b6b-b2e9-d74357538b86",
    },
  },
  ACEPHONE: {
    name: "acephone",
    url: "https://api.acefone.in/v1/click_to_call_support",
    headers: {
      "Content-Type": "application/json",
    },
  },
};

/**
 * Make outbound call using configured provider
 *
 * @param {Object} callData - Standardized call payload
 * @param {string} callData.customerNumber - Customer phone number
 * @param {string} callData.callerNumber - Caller ID number
 * @param {string} callData.virtualNumber - Virtual/K number
 * @param {Object} callData.metadata - Call metadata (agentId, treatmentType, language, etc.)
 * @param {boolean} [callData.isPromotional=false] - Whether call is promotional
 * @param {string} [callData.ivrId] - IVR ID (for Knowlarity)
 * @param {string} [callData.sessionId] - Session ID to link with call
 * @returns {Promise<Object>} API response
 */
async function makeOutboundCall(callData) {
  const callId = uuidv4();
  let dbRecord = null;

  try {
    Logger.info("🚀 Making outbound call", {
      callId,
      customerNumber: callData.customerNumber,
      provider: process.env.OUTBOUND_PROVIDER || "knowlarity",
    });

    // Validate required fields
    validateCallData(callData);

    // Determine provider from environment
    const provider = getActiveProvider();

    // Create database record with INITIATED status
    dbRecord = await createCallRecord({
      sessionId: callId, // Use callId as sessionId
      provider: provider.name,
      callerNumber: callData.callerNumber,
      customerNumber: callData.customerNumber,
      isPromotional: callData.isPromotional || false,
      status: CALL_STATUS.INITIATED,
      metadata: callData.metadata,
      createdAt: Math.floor(Date.now()),
      updatedAt: Math.floor(Date.now()),
    });

    // Create provider-specific payload
    const payload = createProviderPayload(provider, callData);

    // Make API call
    const response = await makeApiCall(provider, payload);

    // Extract provider-specific call ID and session ID
    let providerCallId, sessionIdFromProvider;
    
    if (provider.name === "knowlarity" && response.data.data?.call_ids?.[0]?.call_id) {
      providerCallId = response.data.data.call_ids[0].call_id;
      sessionIdFromProvider = response.data.data.call_ids[0].call_id; // Use call_id as sessionId for Knowlarity
    } else if (provider.name === "acephone") {
      providerCallId = response.data.call_id || response.data.id;
      // For Acephone, use the sessionId we generated and passed in metadata
      sessionIdFromProvider = callData.metadata.sessionId || callId;
    } else {
      providerCallId = response.data.call_id || response.data.id;
      sessionIdFromProvider = callData.sessionId; // Use provided sessionId for other providers
    }

    // Update database record with provider response
    await updateCallRecord(callId, {
      providerCallId,
      sessionId: sessionIdFromProvider || callData.sessionId,
      providerResponse: response.data,
      startTime: new Date(),
    });

    Logger.info("✅ Outbound call initiated successfully", {
      callId,
      provider: provider.name,
      customerNumber: callData.customerNumber,
      providerCallId,
      sessionId: sessionIdFromProvider,
    });

    return {
      success: true,
      callId,
      provider: provider.name,
      providerCallId,
      sessionId: sessionIdFromProvider,
      data: response.data,
    };
  } catch (error) {
    Logger.error("❌ Failed to make outbound call", {
      callId,
      error: error.message,
      customerNumber: callData.customerNumber,
      stack: error.stack,
    });

    // Update database record with FAILED status
    if (dbRecord) {
      await updateCallRecord(callId, {
        status: CALL_STATUS.FAILED,
        errorMessage: error.message,
        endTime: new Date(),
      });
    }

    return {
      success: false,
      callId,
      error: error.message,
      provider: process.env.OUTBOUND_PROVIDER || "unknown",
    };
  }
}

/**
 * Validate required call data fields
 */
function validateCallData(callData) {
  const required = ["customerNumber", "callerNumber", "metadata"];
  const missing = required.filter((field) => !callData[field]);

  if (missing.length > 0) {
    throw new Error(
      `${ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD}: ${missing.join(", ")}`
    );
  }

  if (!callData.metadata.agentId) {
    throw new Error(ERROR_MESSAGES.VALIDATION.MISSING_AGENT_ID);
  }
}

/**
 * Get active provider configuration
 */
function getActiveProvider() {
  const providerName = (
    process.env.OUTBOUND_PROVIDER || "knowlarity"
  ).toUpperCase();
  const provider = PROVIDERS[providerName];

  if (!provider) {
    throw new Error(
      `${ERROR_MESSAGES.OUTBOUND.PROVIDER_NOT_FOUND}: ${providerName}`
    );
  }

  return provider;
}

/**
 * Create provider-specific payload
 */
function createProviderPayload(provider, callData) {
  switch (provider.name) {
    case "knowlarity":
      return createKnowlarityPayload(callData);

    case "acephone":
      return createAcephonePayload(callData);

    default:
      throw new Error(
        `${ERROR_MESSAGES.OUTBOUND.PROVIDER_NOT_CONFIGURED}: ${provider.name}`
      );
  }
}

/**
 * Create Knowlarity-specific payload
 */
function createKnowlarityPayload(callData) {
  return {
    ivr_id: process.env.KNOWLARITY_IVR_ID,
    k_number: process.env.KNOWLARITY_VIRTUAL_NUMBER,
    caller_id: callData.callerNumber,
    customer_number: callData.customerNumber,
    is_promotional: callData.isPromotional ? "true" : "false",
    metadata: {
      ...callData.metadata, // Include any additional metadata
    },
  };
}

/**
 * Create Acephone-specific payload
 */
function createAcephonePayload(callData) {
  // Remove + prefix and country code for Acephone (they expect 10-digit numbers)
  const cleanCustomerNumber = callData.customerNumber.replace(/^\+?91/, "");
  
  // Generate sessionId for Acephone if not provided
  const sessionId = callData.sessionId || uuidv4();

  return {
    customer_number: cleanCustomerNumber,
    api_key: process.env.ACEPHONE_API_KEY,
    metadata: {
      ...callData.metadata, // Include any additional metadata
      sessionId, // Add sessionId to metadata for WebSocket connection
    },
    async: 1, // Acephone async flag
  };
}

/**
 * Make API call to provider
 */
async function makeApiCall(provider, payload) {
  Logger.debug("📡 Making API call", {
    provider: provider.name,
    url: provider.url,
    payload: payload,
  });

  try {
    const response = await axios.post(provider.url, payload, {
      headers: provider.headers,
      timeout: 30000, // 30 second timeout
    });

    if (
      response.status !== HTTP_STATUS.OK &&
      response.status !== HTTP_STATUS.CREATED
    ) {
      throw new Error(
        `${ERROR_MESSAGES.OUTBOUND.API_CALL_FAILED} - Status: ${response.status}`
      );
    }

    return response;
  } catch (error) {
    // Handle specific error types
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error(ERROR_MESSAGES.OUTBOUND.TIMEOUT);
    }

    if (error.response?.status === 429) {
      throw new Error(ERROR_MESSAGES.OUTBOUND.RATE_LIMITED);
    }

    if (error.response?.status >= 500) {
      throw new Error(
        `${ERROR_MESSAGES.SERVER.SERVICE_UNAVAILABLE} - Provider: ${provider.name}`
      );
    }

    // Re-throw original error if not handled above
    throw error;
  }
}

/**
 * Create outbound call record in database
 */
async function createCallRecord(callData) {
  try {
    const record = await db.ivr_calls.create(callData);
    Logger.info("📝 Call record created", { sessionId: callData.sessionId });
    return record;
  } catch (error) {
    Logger.error("❌ Failed to create call record", {
      sessionId: callData.sessionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update outbound call record in database
 */
async function updateCallRecord(callId, updateData) {
  try {
    // Always update the updatedAt timestamp
    updateData.updatedAt = Math.floor(Date.now());
    
    await db.ivr_calls.update(updateData, {
      where: { sessionId: callId },
    });
    Logger.info("📝 Call record updated", { callId, updates: Object.keys(updateData) });
  } catch (error) {
    Logger.error("❌ Failed to update call record", {
      callId,
      error: error.message,
    });
  }
}

/**
 * Mark call as completed
 */
async function markCallCompleted(callId, duration = null) {
  return updateCallRecord(callId, {
    status: CALL_STATUS.COMPLETED,
    endTime: new Date(),
    ...(duration && { duration }),
  });
}

/**
 * Mark call as failed
 */
async function markCallFailed(callId, errorMessage) {
  return updateCallRecord(callId, {
    status: CALL_STATUS.FAILED,
    errorMessage,
    endTime: new Date(),
  });
}

/**
 * Mark call as cancelled
 */
async function markCallCancelled(callId) {
  return updateCallRecord(callId, {
    status: CALL_STATUS.CANCELLED,
    endTime: new Date(),
  });
}

/**
 * Get provider status and configuration info
 */
function getProviderInfo() {
  const activeProvider = getActiveProvider();

  return {
    activeProvider: activeProvider.name,
    availableProviders: Object.keys(PROVIDERS).map(
      (key) => PROVIDERS[key].name
    ),
    configuration: {
      knowlarity: {
        hasApiKey: !!process.env.KNOWLARITY_API_KEY,
        hasIvrId: !!process.env.KNOWLARITY_IVR_ID,
        hasVirtualNumber: !!process.env.KNOWLARITY_VIRTUAL_NUMBER,
      },
      acephone: {
        hasApiKey: !!process.env.ACEPHONE_API_KEY,
      },
    },
  };
}

module.exports = {
  makeOutboundCall,
  markCallCompleted,
  markCallFailed,
  markCallCancelled,
  getProviderInfo,
  PROVIDERS,
};
