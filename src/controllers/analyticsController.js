class AnalyticsController {
  constructor(mcpServer) {
    this.mcpServer = mcpServer;
  }

  async getAnalytics(req, res) {
    try {
      const analytics = await this.mcpServer.executeTool('get_conversation_analytics', {
        timeRange: req.query.timeRange || 'all'
      });
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async exportData(req, res) {
    try {
      const format = req.query.format || 'json';
      const sessionIds = req.query.sessionIds ? req.query.sessionIds.split(',') : null;
      
      const exportData = await this.mcpServer.executeTool('export_patient_data', {
        format,
        sessionIds
      });

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="patient_data.csv"');
        res.send(exportData.data);
      } else {
        res.json(exportData);
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AnalyticsController;