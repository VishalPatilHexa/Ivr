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
    // Determine provider from environment
    const provider = getActiveProvider(callData.provider);

    // Create database record with INITIATED status
    // Note: createdAt serves as call initiation time
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
    if (callData?.metadata?.originalRequestData) {
      delete callData.metadata.originalRequestData;
    }

    // Create provider-specific payload
    const payload = createProviderPayload(provider, callData, dbRecord);

    // Make API call
    const response = await makeApiCall(provider, payload);

    // Extract session ID from provider response
    let sessionIdFromProvider;

    if (
      provider.name === "knowlarity" &&
      response.data.data?.call_ids?.[0]?.call_id
    ) {
      // For Knowlarity: Use call_id from response as is, then add _0 suffix for WebSocket path matching
      sessionIdFromProvider = response.data.data.call_ids[0].call_id;
    } else if (provider.name === "acephone") {
      // For Acephone: Use sessionId from metadata or fallback to our generated callId
      sessionIdFromProvider = callData.metadata.sessionId || callId;
    } else {
      sessionIdFromProvider = callData.sessionId; // Use provided sessionId for other providers
    }

    // Prepare final sessionId for database storage
    let finalSessionId;
    if (provider.name === "knowlarity") {
      // Add _0 suffix only for Knowlarity to match WebSocket path format
      finalSessionId = sessionIdFromProvider
        ? `${sessionIdFromProvider}_0`
        : null;
    } else {
      // For other providers, use sessionId as is
      finalSessionId = sessionIdFromProvider || callData.sessionId;
    }

    await updateCallRecord(callId, {
      sessionId: finalSessionId,
      providerResponse: response.data,
    });

    Logger.info("✅ Outbound call initiated successfully", {
      callId,
      provider: provider.name,
      customerNumber: callData.customerNumber,
      sessionId: finalSessionId,
    });

    return {
      success: true,
      callId,
      provider: provider.name,
      sessionId: finalSessionId,
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
function getActiveProvider(providerName) {
  if (!providerName) {
    providerName = (
      process.env.OUTBOUND_PROVIDER || "knowlarity"
    ).toUpperCase();
  }
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
function createProviderPayload(provider, callData, dbRecord) {
  switch (provider.name) {
    case "knowlarity":
      return createKnowlarityPayload(callData, dbRecord);

    case "acephone":
      return createAcephonePayload(callData, dbRecord);

    default:
      throw new Error(
        `${ERROR_MESSAGES.OUTBOUND.PROVIDER_NOT_CONFIGURED}: ${provider.name}`
      );
  }
}

/**
 * Create Knowlarity-specific payload
 */
function createKnowlarityPayload(callData, dbRecord) {
  return {
    ivr_id: process.env.KNOWLARITY_IVR_ID,
    k_number: process.env.KNOWLARITY_VIRTUAL_NUMBER,
    caller_id: formatPhoneWithCountryCode(callData.callerNumber),
    customer_number: formatPhoneWithCountryCode(callData.customerNumber),
    is_promotional: callData.isPromotional ? "true" : "false",
    metadata: {
      ...callData.metadata, // Include any additional metadata
      ivrCallId: dbRecord.id, // Pass database record ID for tracking
    },
  };
}

/**
 * Create Acephone-specific payload
 */
function createAcephonePayload(callData, dbRecord) {
  // Remove + prefix and country code for Acephone (they expect 10-digit numbers)
  const cleanCustomerNumber = callData.customerNumber.replace(/^\+?91/, "");
  return {
    customer_number: cleanCustomerNumber,
    api_key: process.env.ACEPHONE_API_KEY,
    metadata: {
      ...callData.metadata, // Include any additional metadata
      sessionId: dbRecord.sessionId, // Add sessionId to metadata for WebSocket connection
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
 * Normalize phone number for database storage (get last 10 digits)
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";

  // Convert to string and remove any non-digit characters
  const cleanNumber = String(phoneNumber).replace(/\D/g, "");

  // Get last 10 digits for database storage
  return cleanNumber.slice(-10);
}

/**
 * Format phone number with country code for API calls
 */
function formatPhoneWithCountryCode(phoneNumber, countryCode = "+91") {
  if (!phoneNumber) return "";

  // Get normalized 10-digit number
  const normalizedNumber = normalizePhoneNumber(phoneNumber);

  // Add country code if not already present
  if (normalizedNumber.length === 10) {
    return `${countryCode}${normalizedNumber}`;
  }

  return phoneNumber; // Return as-is if already formatted
}

/**
 * Create outbound call record in database
 */
async function createCallRecord(callData) {
  try {
    // Normalize phone numbers for database storage
    const normalizedData = {
      ...callData,
      callerNumber: normalizePhoneNumber(callData.callerNumber),
      customerNumber: normalizePhoneNumber(callData.customerNumber),
    };

    const record = await db.ivr_calls.create(normalizedData);
    Logger.info("📝 Call record created", {
      sessionId: callData.sessionId,
      callerNumber: normalizedData.callerNumber,
      customerNumber: normalizedData.customerNumber,
    });
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
async function updateCallRecord(sessionId, updateData) {
  try {
    // Always update the updatedAt timestamp
    updateData.updatedAt = Math.floor(Date.now());

    const [updatedRows] = await db.ivr_calls.update(updateData, {
      where: { sessionId: sessionId },
    });

    Logger.info("📝 Call record updated", {
      sessionId,
      updatedRows,
      updates: Object.keys(updateData),
    });

    if (updatedRows === 0) {
      Logger.warn("⚠️ No call record found to update", {
        sessionId: sessionId,
      });
    }
  } catch (error) {
    Logger.error("❌ Failed to update call record", {
      sessionId,
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Mark call as completed
 */
async function markCallCompleted(callId, duration = null) {
  return updateCallRecord(callId, {
    status: CALL_STATUS.COMPLETED,
    endTime: Math.floor(Date.now()),
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
    endTime: Math.floor(Date.now()),
  });
}

/**
 * Mark call as cancelled
 */
async function markCallCancelled(callId) {
  return updateCallRecord(callId, {
    status: CALL_STATUS.CANCELLED,
    callEndTime: Math.floor(Date.now()),
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

/**
 * Update callStartTime when WebSocket connection is established
 */
async function updateCallStartTime(ivrCallId) {
  try {
    const startTime = Math.floor(Date.now());
    Logger.info("📞 Updating callStartTime for WebSocket connection", {
      ivrCallId,
      startTime,
    });

    const [updatedRows] = await db.ivr_calls.update(
      {
        callStartTime: startTime,
        updatedAt: startTime,
      },
      { where: { id: ivrCallId } }
    );

    if (updatedRows === 0) {
      Logger.warn("⚠️ No call record found to update callStartTime", {
        ivrCallId,
      });
    } else {
      Logger.info("✅ CallStartTime updated successfully", {
        ivrCallId,
        startTime,
      });
    }
  } catch (error) {
    Logger.error("❌ Failed to update callStartTime", {
      ivrCallId,
      error: error.message,
    });
  }
}

/**
 * Update callEndTime when call ends
 */
async function updateCallEndTime(ivrCallId) {
  try {
    const endTime = Math.floor(Date.now());
    Logger.info("📞 Updating callEndTime for call completion", {
      ivrCallId,
      endTime,
    });

    const [updatedRows] = await db.ivr_calls.update(
      {
        callEndTime: endTime,
        status: CALL_STATUS.COMPLETED,
        updatedAt: endTime,
      },
      { where: { id: ivrCallId } }
    );

    if (updatedRows === 0) {
      Logger.warn("⚠️ No call record found to update callEndTime", {
        ivrCallId,
      });
    } else {
      Logger.info("✅ CallEndTime updated successfully", {
        ivrCallId,
        endTime,
      });
    }
  } catch (error) {
    Logger.error("❌ Failed to update callEndTime", {
      ivrCallId,
      error: error.message,
    });
  }
}

module.exports = {
  updateCallRecord,
  makeOutboundCall,
  markCallCompleted,
  markCallFailed,
  markCallCancelled,
  updateCallStartTime,
  updateCallEndTime,
  getProviderInfo,
  normalizePhoneNumber,
  formatPhoneWithCountryCode,
  PROVIDERS,
};
