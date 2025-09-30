/**
 * ===============================================================================
 * TEST ROUTES
 * ===============================================================================
 *
 * Test endpoints for webhook and API testing
 */

const express = require("express");
const router = express.Router();
const { callTestWebhook, createSampleWebhookData } = require("../../services/testWebhook");
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require("../../constants");
const Logger = require("../../utils/logger");

/**
 * POST /api/v1/test/webhook
 * Test webhook call with provided data
 */
router.post("/webhook", async (req, res) => {
  try {
    Logger.info("🧪 Test webhook endpoint called", {
      body: req.body,
      userAgent: req.get("User-Agent"),
    });

    // Use provided data or create sample data
    const webhookData = Object.keys(req.body).length > 0 ? req.body : createSampleWebhookData();

    // Call test webhook
    const result = await callTestWebhook(webhookData);

    if (result.success) {
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.GENERAL.OPERATION_SUCCESSFUL,
        data: {
          webhookResponse: result.data,
          status: result.status,
        },
      });
    } else {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
        error: result.error,
      });
    }
  } catch (error) {
    Logger.error("❌ Test webhook endpoint error", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/test/webhook/sample
 * Get sample webhook data structure
 */
router.get("/webhook/sample", (req, res) => {
  try {
    const sampleData = createSampleWebhookData();

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.GENERAL.DATA_RETRIEVED,
      data: sampleData,
    });
  } catch (error) {
    Logger.error("❌ Sample webhook data error", {
      error: error.message,
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      error: error.message,
    });
  }
});

module.exports = router;