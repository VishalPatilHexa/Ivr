/**
 * ===============================================================================
 * OUTBOUND CALL ROUTES
 * ===============================================================================
 *
 * API endpoints for making outbound calls through different providers
 */

const express = require('express');
const router = express.Router();
const outboundCallService = require('../services/outboundCall');
const Logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../../constants');

/**
 * POST /api/v1/outbound/call
 * Make an outbound call using configured provider
 * 
 * Body:
 * {
 *   "customerNumber": "+917972318018",
 *   "callerNumber": "+918047224660", 
 *   "virtualNumber": "+919513439773", // optional
 *   "isPromotional": false, // optional, default false
 *   "ivrId": "1000129909", // optional, for Knowlarity
 *   "metadata": {
 *     "agentId": "agent_2801k10mggvefy5vjfrybj2grs5j",
 *     "treatmentType": "Piles",
 *     "language": "hi",
 *     "campaign_id": "HEALTH_CAMP_2024", // optional
 *     "department": "cardiology", // optional
 *     "priority": "high" // optional
 *   }
 * }
 */
router.post('/call', async (req, res) => {
  try {
    Logger.info('📞 Outbound call request received', {
      customerNumber: req.body.customerNumber,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Validate request body
    if (!req.body) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: ERROR_MESSAGES.VALIDATION.INVALID_REQUEST_BODY
      });
    }

    const callData = {
      customerNumber: req.body.customerNumber,
      callerNumber: req.body.callerNumber,
      virtualNumber: req.body.virtualNumber,
      isPromotional: req.body.isPromotional || false,
      ivrId: req.body.ivrId,
      metadata: req.body.metadata || {}
    };

    // Make outbound call
    const result = await outboundCallService.makeOutboundCall(callData);

    if (result.success) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.OUTBOUND.CALL_INITIATED,
        data: {
          callId: result.callId,
          provider: result.provider,
          customerNumber: callData.customerNumber
        }
      });
    } else {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: result.error,
        provider: result.provider
      });
    }

  } catch (error) {
    Logger.error('❌ Outbound call endpoint error', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      message: error.message
    });
  }
});

/**
 * GET /api/v1/outbound/provider-info
 * Get current provider configuration and status
 */
router.get('/provider-info', (req, res) => {
  try {
    const providerInfo = outboundCallService.getProviderInfo();
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.OUTBOUND.PROVIDER_INFO_RETRIEVED,
      data: providerInfo
    });
    
  } catch (error) {
    Logger.error('❌ Provider info endpoint error', error);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      message: error.message
    });
  }
});

/**
 * POST /api/v1/outbound/test
 * Test endpoint for outbound call functionality (logs only, no actual call)
 */
router.post('/test', (req, res) => {
  try {
    Logger.info('🧪 Outbound call test request', {
      body: req.body,
      provider: process.env.OUTBOUND_PROVIDER || 'knowlarity'
    });

    const providerInfo = outboundCallService.getProviderInfo();
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.OUTBOUND.TEST_COMPLETED,
      data: {
        receivedPayload: req.body,
        providerInfo: providerInfo,
        wouldCallProvider: providerInfo.activeProvider
      }
    });
    
  } catch (error) {
    Logger.error('❌ Outbound call test error', error);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
      message: error.message
    });
  }
});

module.exports = router;