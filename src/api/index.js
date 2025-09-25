/**
 * ===============================================================================
 * API CLIENTS INDEX
 * ===============================================================================
 *
 * Central export for all API clients
 * Provides easy access to configured API clients throughout the application
 */

const elevenLabsClient = require("./clients/elevenLabsClient");
const knowlarityClient = require("./clients/knowlarityClient");
const {
  ExternalClient,
  createTwilioClient,
  createWebhookClient,
} = require("./clients/externalClient");
const { createBaseClient, createRetryClient } = require("./baseClient");

// Pre-configured client instances
const clients = {
  elevenLabs: elevenLabsClient,
  knowlarity: knowlarityClient,
  twilio: createTwilioClient(),
};

module.exports = {
  // Individual clients
  elevenLabsClient,
  knowlarityClient,

  // Client factories
  ExternalClient,
  createTwilioClient,
  createWebhookClient,
  createBaseClient,
  createRetryClient,

  // Pre-configured clients object
  clients,
};
