/**
 * ===============================================================================
 * OUTBOUND CALL CONTROLLER
 * ===============================================================================
 *
 * Handles outbound call requests for different telephony providers
 */

const outboundCallService = require("../services/outboundCall");
const Logger = require("../utils/logger");
const {
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} = require("../constants");

/**
 * Make an outbound call
 */
async function makeOutboundCall(req, res) {
  try {
    Logger.info("📞 Outbound call request received", {
      customerNumber: req.body.customerNumber,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });

    if (!req.body) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: ERROR_MESSAGES.VALIDATION.INVALID_REQUEST_BODY,
      });
    }

    const callData = {
      customerNumber: req.body.customerNumber,
      callerNumber: req.body.callerNumber,
      virtualNumber: req.body.virtualNumber,
      isPromotional: req.body.isPromotional || false,
      ivrId: req.body.ivrId,
      metadata: req.body.metadata || {},
      provider: req.body?.metadata?.provider || process.env.OUTBOUND_PROVIDER,
    };

    const result = await outboundCallService.makeOutboundCall(callData);

    if (result.success) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.OUTBOUND.CALL_INITIATED,
        data: {
          callId: result.callId,
          provider: result.provider,
          customerNumber: callData.customerNumber,
        },
      });
    } else {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: result.error,
        provider: result.provider,
      });
    }
  } catch (error) {
    Logger.error("❌ Outbound call endpoint error", {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      message: error.message,
    });
  }
}

/**
 * Get provider information
 */
function getProviderInfo(req, res) {
  try {
    const providerInfo = outboundCallService.getProviderInfo();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.OUTBOUND.PROVIDER_INFO_RETRIEVED,
      data: providerInfo,
    });
  } catch (error) {
    Logger.error("❌ Provider info endpoint error", error);

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      message: error.message,
    });
  }
}

/**
 * Test outbound call endpoint
 */
function testOutboundCall(req, res) {
  try {
    Logger.info("🧪 Outbound call test request", {
      body: req.body,
      provider: process.env.OUTBOUND_PROVIDER || "knowlarity",
    });

    const providerInfo = outboundCallService.getProviderInfo();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.OUTBOUND.TEST_COMPLETED,
      data: {
        receivedPayload: req.body,
        providerInfo: providerInfo,
        wouldCallProvider: providerInfo.activeProvider,
      },
    });
  } catch (error) {
    Logger.error("❌ Outbound call test error", error);

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      message: error.message,
    });
  }
}

module.exports = {
  makeOutboundCall,
  getProviderInfo,
  testOutboundCall,
};
