const express = require('express');

const router = express.Router();

const createElevenLabsRoutes = (elevenLabsController) => {
  // ElevenLabs API endpoints
  router.post('/api/elevenlabs/call', elevenLabsController.makeCall.bind(elevenLabsController));
  router.get('/api/elevenlabs/phone-numbers', elevenLabsController.getPhoneNumbers.bind(elevenLabsController));
  router.post('/api/elevenlabs/configure-phone', elevenLabsController.configurePhone.bind(elevenLabsController));
  router.get('/api/elevenlabs/agent-info', elevenLabsController.getAgentInfo.bind(elevenLabsController));
  router.get('/api/elevenlabs/check-access', elevenLabsController.checkAccess.bind(elevenLabsController));
  
  return router;
};

module.exports = createElevenLabsRoutes;