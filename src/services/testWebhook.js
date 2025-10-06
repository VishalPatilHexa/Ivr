/**
 * ===============================================================================
 * TEST WEBHOOK SERVICE (LEGACY - DEPRECATED)
 * ===============================================================================
 *
 * Legacy webhook service - now uses utilities from /src/webhooks/utils
 *
 * ⚠️ This file is kept for backward compatibility.
 * New code should use the utilities directly:
 * - payloadMapper.mapElevenLabsToWebhook()
 * - httpClient.callHexaHealthWebhook()
 */

const Logger = require("../utils/logger");
const payloadMapper = require("../webhooks/utils/payloadMapper");
const httpClient = require("../webhooks/utils/httpClient");

/**
 * Call test webhook (legacy wrapper for backward compatibility)
 * @deprecated Use httpClient.callHexaHealthWebhook() directly
 */
async function callTestWebhook(callData) {
  Logger.warn(
    "⚠️ Using deprecated callTestWebhook function. Consider using httpClient.callHexaHealthWebhook() directly."
  );

  return httpClient.callHexaHealthWebhook(callData);
}

/**
 * Make webhook API call (legacy wrapper for backward compatibility)
 * @deprecated Use httpClient.makeWebhookCall() directly
 */
async function makeWebhookCall(payload) {
  Logger.warn(
    "⚠️ Using deprecated makeWebhookCall function. Consider using httpClient.makeWebhookCall() directly."
  );

  const webhookUrl =
    process.env.HEXAHEALTH_WEBHOOK_URL ||
    "https://stagapi.hexahealth.com/call/v1/thirdparty/voice-bot-sync";

  const result = await httpClient.makeWebhookCall(webhookUrl, payload);

  if (!result.success) {
    throw new Error(result.error);
  }

  return {
    status: result.status,
    data: result.data,
  };
}

/**
 * Map ElevenLabs data to webhook format (legacy wrapper for backward compatibility)
 * @deprecated Use payloadMapper.mapElevenLabsToWebhook() directly
 */
function mapElevenLabsToWebhook(elevenLabsData, callRecord = null) {
  Logger.warn(
    "⚠️ Using deprecated mapElevenLabsToWebhook function. Consider using payloadMapper.mapElevenLabsToWebhook() directly."
  );

  return payloadMapper.mapElevenLabsToWebhook(elevenLabsData, callRecord);
}

// Legacy exports - All functions now use utilities from /src/webhooks/utils

module.exports = {
  callTestWebhook,
  mapElevenLabsToWebhook,
};
