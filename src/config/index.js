const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    websocketUrl: process.env.SERVER_WEBSOCKET_URL || 'wss://stream.hexahealth.com',
  },

  // ElevenLabs Configuration
  elevenlabs: {
    agentId: process.env.ELEVENLABS_AGENT_ID || 'agent_2801k10mggvefy5vjfrybj2grs5j',
    apiKey: process.env.ELEVENLABS_API_KEY,
    websocketUrl: process.env.ELEVENLABS_WEBSOCKET_URL || 'wss://api.elevenlabs.io',
  },

  // Google Sheets Configuration
  googleSheets: {
    scriptUrl: process.env.GOOGLE_SHEETS_SCRIPT_URL,
  },

  // Audio Configuration
  audio: {
    sampleRate: 16000,
    amplificationFactor: 2.5,
    format: 'pcm',
    encoding: '16-bit',
  },

  // Session Configuration
  session: {
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    defaultLanguage: 'hindi',
    defaultTreatmentType: 'Piles',
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableDebug: process.env.NODE_ENV === 'development',
  },
};

module.exports = config;