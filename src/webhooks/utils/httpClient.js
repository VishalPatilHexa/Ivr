/**
 * ===============================================================================
 * WEBHOOK HTTP CLIENT
 * ===============================================================================
 *
 * Reusable HTTP client for making webhook API calls
 */

const axios = require("axios");
const Logger = require("../../utils/logger");
const { HTTP_STATUS } = require("../../constants");

/**
 * Default webhook configuration
 */
const DEFAULT_CONFIG = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
};

/**
 * Build standard webhook headers
 */
function buildWebhookHeaders(customHeaders = {}) {
  return {
    connection: "upgrade",
    host: "stagapi.hexahealth.com",
    "x-forwarded-for": "3.223.179.38",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
    "x-amzn-trace-id": `Root=1-${Math.floor(Date.now() / 1000).toString(
      16
    )}-${Math.random().toString(16).substring(2, 26)}`,
    accept:
      "text/plain, application/xml, text/xml, application/json, application/*+xml, application/*+json, */*",
    "content-type": "application/json",
    applicationtype: "crmapi",
    authorization:
      process.env.HEXAHEALTH_WEBHOOK_TOKEN ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NzI4NzcsIm5hbWUiOiJwYXJ0aCB0ZXN0Iiwicm9sZSI6IlRISVJEX1BBUlRZIiwic2Vjb25kYXJ5Um9sZXMiOm51bGwsIm1vYmlsZU5vIjo5OTUzODEwMTI3LCJpYXQiOjE3NDI4MjA4NzAsImV4cCI6MTgzNzQ5NTU0MH0.TYtOpu9n2-OB9l5ZWI5DS_MWHFFtWaPAxB3WzN0bgQU",
    "user-agent": "Apache-HttpClient/4.5.13 (Java/17.0.14)",
    "accept-encoding": "gzip,deflate",
    ...customHeaders,
  };
}

/**
 * Make HTTP POST request to webhook endpoint
 */
async function makeWebhookCall(url, payload, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  Logger.debug("📡 Making webhook API call", {
    url,
    payloadSize: JSON.stringify(payload).length,
  });

  try {
    const response = await axios.post(url, payload, {
      headers: buildWebhookHeaders(config.headers),
      timeout: config.timeout,
    });

    if (
      response.status !== HTTP_STATUS.OK &&
      response.status !== HTTP_STATUS.CREATED
    ) {
      throw new Error(`Webhook call failed - Status: ${response.status}`);
    }

    Logger.info("✅ Webhook call successful", {
      url,
      status: response.status,
    });

    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    return handleWebhookError(error, url, config);
  }
}

/**
 * Handle webhook HTTP errors
 */
function handleWebhookError(error, url, config) {
  let errorMessage = error.message;
  let shouldRetry = false;

  // Handle specific error types
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    errorMessage = "Webhook call timeout";
    shouldRetry = true;
  } else if (error.response?.status === 429) {
    errorMessage = "Webhook rate limited";
    shouldRetry = true;
  } else if (error.response?.status >= 500) {
    errorMessage = `Webhook service unavailable - Status: ${error.response.status}`;
    shouldRetry = true;
  }

  Logger.error("❌ Webhook call failed", {
    url,
    error: errorMessage,
    status: error.response?.status,
    shouldRetry,
  });

  return {
    success: false,
    error: errorMessage,
    status: error.response?.status,
    shouldRetry,
  };
}

/**
 * Make webhook call with retry logic
 */
async function makeWebhookCallWithRetry(url, payload, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  let lastError = null;

  for (let attempt = 1; attempt <= config.retries; attempt++) {
    Logger.debug(`🔄 Webhook attempt ${attempt}/${config.retries}`, { url });

    const result = await makeWebhookCall(url, payload, config);

    if (result.success) {
      return result;
    }

    lastError = result;

    // Don't retry if it's not a retriable error
    if (!result.shouldRetry) {
      break;
    }

    // Wait before retrying (exponential backoff)
    if (attempt < config.retries) {
      const delay = config.retryDelay * Math.pow(2, attempt - 1);
      Logger.debug(`⏳ Waiting ${delay}ms before retry`, { attempt });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return lastError;
}

/**
 * Call HexaHealth webhook endpoint
 */
async function callHexaHealthWebhook(payload, options = {}) {
  const webhookUrl =
    process.env.HEXAHEALTH_WEBHOOK_URL ||
    "https://stagapi.hexahealth.com/call/v1/thirdparty/voice-bot-sync";

  Logger.info("🚀 Calling HexaHealth webhook", {
    event: payload.event,
    callTo: payload.callTo,
  });

  return makeWebhookCallWithRetry(webhookUrl, payload, options);
}

/**
 * Validate webhook payload before sending
 */
function validateWebhookPayload(payload, requiredFields = []) {
  const defaultRequiredFields = ["event", "timestamp"];
  const fieldsToCheck = [...defaultRequiredFields, ...requiredFields];

  const missingFields = fieldsToCheck.filter((field) => !payload[field]);

  if (missingFields.length > 0) {
    Logger.error("❌ Invalid webhook payload", {
      missingFields,
    });
    return {
      valid: false,
      missingFields,
    };
  }

  return {
    valid: true,
    missingFields: [],
  };
}

module.exports = {
  buildWebhookHeaders,
  makeWebhookCall,
  makeWebhookCallWithRetry,
  callHexaHealthWebhook,
  validateWebhookPayload,
  handleWebhookError,
};
