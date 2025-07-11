const express = require('express');

const router = express.Router();

const createAnalyticsRoutes = (analyticsController) => {
  router.get('/analytics', analyticsController.getAnalytics.bind(analyticsController));
  router.get('/export', analyticsController.exportData.bind(analyticsController));
  
  return router;
};

module.exports = createAnalyticsRoutes;