const axios = require("axios");

class ElevenLabsService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = "https://api.elevenlabs.io/v1";
  }

  async getVoices() {
    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          "xi-api-key": this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      console.error("Error fetching voices:", error);
      throw new Error("Failed to fetch voices");
    }
  }

  async synthesizeSpeech(text, voiceId = "21m00Tcm4TlvDq8ikWAM") {
    try {
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/7w5JDCUNbeKrn4ySFgfu`,
        {
          text: text,
          model_id: "eleven_multilingual_v2", // Supports Hindi
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          responseType: "arraybuffer",
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error("Error synthesizing speech:", error);
      throw new Error("Failed to synthesize speech");
    }
  }
}

module.exports = { ElevenLabsService };
