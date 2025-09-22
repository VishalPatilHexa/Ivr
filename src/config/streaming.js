module.exports = {
  maxConnections: process.env.MAX_STREAMING_CONNECTIONS || 100,
  sessionTimeout: parseInt(process.env.STREAMING_SESSION_TIMEOUT) || 300000, // 5 minutes
  cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 300000, // 5 minutes
  
  // ElevenLabs Configuration
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agentId: process.env.ELEVENLABS_AGENT_ID,
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET,
    baseUrl: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io'
  },

  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    webhookUrl: process.env.TWILIO_WEBHOOK_URL
  }
};