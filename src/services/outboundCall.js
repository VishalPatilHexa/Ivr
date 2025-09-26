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
const {
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
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
 * @returns {Promise<Object>} API response
 */
async function makeOutboundCall(callData) {
  try {
    Logger.info("🚀 Making outbound call", {
      customerNumber: callData.customerNumber,
      provider: process.env.OUTBOUND_PROVIDER || "knowlarity",
    });

    // Validate required fields
    validateCallData(callData);

    // Determine provider from environment
    const provider = getActiveProvider();

    // Create provider-specific payload
    const payload = createProviderPayload(provider, callData);

    // Make API call
    const response = await makeApiCall(provider, payload);

    Logger.info("✅ Outbound call initiated successfully", {
      provider: provider.name,
      customerNumber: callData.customerNumber,
      callId: response.data.call_id || response.data.id || "unknown",
    });

    return {
      success: true,
      provider: provider.name,
      callId: response.data.call_id || response.data.id,
      data: response.data,
    };
  } catch (error) {
    Logger.error("❌ Failed to make outbound call", {
      error: error.message,
      customerNumber: callData.customerNumber,
      stack: error.stack,
    });

    return {
      success: false,
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

  return {
    customer_number: cleanCustomerNumber,
    api_key: process.env.ACEPHONE_API_KEY,
    metadata: {
      ...callData.metadata, // Include any additional metadata
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
  getProviderInfo,
  PROVIDERS,
};
