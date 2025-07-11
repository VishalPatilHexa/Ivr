const express = require('express');

const router = express.Router();

const createOutboundCallRoutes = (outboundCallController) => {
  // Outbound call API endpoints
  router.post('/api/outbound-call', outboundCallController.initiateCall.bind(outboundCallController));
  router.get('/api/outbound-call/:sessionId', outboundCallController.getCallStatus.bind(outboundCallController));
  router.get('/api/outbound-calls', outboundCallController.getActiveCalls.bind(outboundCallController));
  
  // Knowlarity webhook endpoints
  router.post('/api/knowlarity/webhook', outboundCallController.handleWebhook.bind(outboundCallController));
  router.post('/callback', outboundCallController.handleCallback.bind(outboundCallController));
  
  return router;
};

module.exports = createOutboundCallRoutes;