/**
 * ===============================================================================
 * WEBHOOK UTILITIES INDEX
 * ===============================================================================
 *
 * Central export for all webhook utilities
 *
 * Usage:
 *   const webhookUtils = require('../webhooks/utils');
 *   const { sessionId } = webhookUtils.dataExtractor.extractSessionInfo(data);
 *   const payload = webhookUtils.payloadMapper.mapElevenLabsToWebhook(data, record);
 *   await webhookUtils.httpClient.callHexaHealthWebhook(payload);
 */

const dataExtractor = require("./dataExtractor");
const payloadMapper = require("./payloadMapper");
const httpClient = require("./httpClient");
const sessionCleanup = require("./sessionCleanup");

module.exports = {
  dataExtractor,
  payloadMapper,
  httpClient,
  sessionCleanup,
};
