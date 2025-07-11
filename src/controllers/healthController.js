class HealthController {
  static getHealth(req, res) {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      services: {
        elevenLabs: !!process.env.ELEVENLABS_API_KEY,
        mcp: true
      }
    });
  }
}

module.exports = HealthController;