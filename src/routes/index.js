const healthRoutes = require('./healthRoutes');
const createAnalyticsRoutes = require('./analyticsRoutes');
const createOutboundCallRoutes = require('./outboundCallRoutes');
const createElevenLabsRoutes = require('./elevenLabsRoutes');

const setupRoutes = (app, controllers) => {
  // Health routes
  app.use('/', healthRoutes);
  
  // Analytics routes
  app.use('/', createAnalyticsRoutes(controllers.analyticsController));
  
  // Outbound call routes
  app.use('/', createOutboundCallRoutes(controllers.outboundCallController));
  
  // ElevenLabs routes
  app.use('/', createElevenLabsRoutes(controllers.elevenLabsController));
};

module.exports = setupRoutes;