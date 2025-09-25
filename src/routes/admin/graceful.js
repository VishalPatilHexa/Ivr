/**
 * ===============================================================================
 * ADMIN GRACEFUL RESTART ROUTES
 * ===============================================================================
 *
 * Admin endpoints for managing graceful restarts and monitoring active calls
 */

const express = require('express');
const router = express.Router();
const gracefulShutdown = require('../../core/gracefulShutdown');
const Logger = require('../../utils/logger');

/**
 * GET /admin/active-calls
 * Check current active calls
 */
router.get('/active-calls', async (req, res) => {
  try {
    Logger.info('Admin checking active calls');
    
    const activeCalls = await gracefulShutdown.getActiveCalls();
    
    res.json({
      success: true,
      activeCallCount: activeCalls.length,
      activeCalls: activeCalls,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.error('Failed to get active calls:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active calls',
      message: error.message
    });
  }
});

/**
 * POST /admin/graceful-restart
 * Initiate graceful restart
 */
router.post('/graceful-restart', async (req, res) => {
  try {
    Logger.info('Admin initiated graceful restart');
    
    const activeCalls = await gracefulShutdown.getActiveCalls();
    
    if (activeCalls.length === 0) {
      res.json({
        success: true,
        message: 'No active calls found. Restarting immediately...',
        activeCallCount: 0,
        action: 'immediate_restart'
      });

      Logger.info('🔄 Immediate restart - no active calls');
      
      // Delay to send response, then restart
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      
      return;
    }

    // Active calls found - respond but don't restart yet
    res.json({
      success: false,
      message: `${activeCalls.length} active calls found. Will restart when calls complete.`,
      activeCallCount: activeCalls.length,
      activeCalls: activeCalls.map(call => ({
        sessionId: call.sessionId,
        status: call.status,
        duration: Math.round(call.duration / 1000),
        clientType: call.clientType
      })),
      action: 'waiting_for_calls',
      maxWaitTime: Math.round(gracefulShutdown.maxWaitTime / 1000)
    });

    Logger.info(`📞 Graceful restart delayed - ${activeCalls.length} active calls`);

    // Start waiting for calls to complete in background
    gracefulShutdown.waitForCallsToComplete().then(() => {
      Logger.info('🔄 All calls completed - restarting now');
      process.exit(0);
    });

  } catch (error) {
    Logger.error('Failed graceful restart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate graceful restart',
      message: error.message
    });
  }
});

/**
 * POST /admin/force-restart  
 * Force restart immediately (emergency only)
 */
router.post('/force-restart', async (req, res) => {
  try {
    const activeCalls = await gracefulShutdown.getActiveCalls();
    
    Logger.warn(`⚠️ Admin forced restart with ${activeCalls.length} active calls`);
    
    res.json({
      success: true,
      message: `Force restart initiated. ${activeCalls.length} active calls will be terminated.`,
      activeCallCount: activeCalls.length,
      action: 'force_restart'
    });

    // Force restart after brief delay
    setTimeout(() => {
      gracefulShutdown.forceShutdown();
    }, 1000);

  } catch (error) {
    Logger.error('Failed force restart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to force restart',
      message: error.message
    });
  }
});

/**
 * GET /admin/system-status
 * Get overall system status
 */
router.get('/system-status', async (req, res) => {
  try {
    const activeCalls = await gracefulShutdown.getActiveCalls();
    
    res.json({
      success: true,
      status: 'running',
      activeCallCount: activeCalls.length,
      isShuttingDown: gracefulShutdown.isShuttingDown,
      uptime: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.error('Failed to get system status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

module.exports = router;