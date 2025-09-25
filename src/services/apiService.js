/**
 * ===============================================================================
 * API SERVICE
 * ===============================================================================
 *
 * Service layer for external API interactions
 * Provides high-level business logic for API operations
 */

const { clients } = require("../api");
const Logger = require("../utils/logger");
const { ERRORS } = require("../constants");

class ApiService {
  constructor() {
    this.elevenLabs = clients.elevenLabs;
    this.knowlarity = clients.knowlarity;
    this.twilio = clients.twilio;
  }

  /**
   * Initialize a conversation with ElevenLabs
   */
  async initializeConversation(agentId, sessionData) {
    try {
      Logger.info("Initializing conversation with ElevenLabs", {
        agentId,
        sessionId: sessionData.sessionId,
      });

      // Get agent details first
      const agent = await this.elevenLabs.getAgent(agentId);
      Logger.info("Agent details retrieved", { agentName: agent.name });

      // Create conversation
      const conversation = await this.elevenLabs.createConversation(
        agentId,
        sessionData
      );

      return {
        success: true,
        conversation,
        agent,
        websocketUrl: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
      };
    } catch (error) {
      Logger.error("Failed to initialize conversation", error);
      throw {
        code: ERRORS.CODES.STREAMING_ERROR,
        message: "Failed to initialize ElevenLabs conversation",
        original: error,
      };
    }
  }

  /**
   * Make outbound call via Knowlarity
   */
  async makeCall(callRequest) {
    try {
      Logger.info("Making outbound call", {
        to: callRequest.to,
        from: callRequest.from,
      });

      const callData = {
        to: callRequest.to,
        from: callRequest.from,
        agentNumber: callRequest.agentNumber,
        sessionId: callRequest.sessionId,
        webhookUrl:
          callRequest.webhookUrl ||
          `${process.env.BASE_URL}/api/v1/webhook/knowlarity`,
        callType: "outbound",
      };

      const response = await this.knowlarity.makeOutboundCall(callData);

      Logger.info("Outbound call initiated", {
        callId: response.call_id,
        status: response.status,
      });

      return {
        success: true,
        callId: response.call_id,
        status: response.status,
        message: "Call initiated successfully",
      };
    } catch (error) {
      Logger.error("Failed to make outbound call", error);
      throw {
        code: ERRORS.CODES.STREAMING_ERROR,
        message: "Failed to initiate outbound call",
        original: error,
      };
    }
  }

  /**
   * Get call analytics
   */
  async getCallAnalytics(filters = {}) {
    try {
      Logger.info("Fetching call analytics", filters);

      const [knowlarityAnalytics, elevenLabsUsage] = await Promise.allSettled([
        this.knowlarity.getCallAnalytics(filters),
        this.elevenLabs.getUsage(),
      ]);

      const analytics = {
        timestamp: new Date().toISOString(),
        filters,
        knowlarity:
          knowlarityAnalytics.status === "fulfilled"
            ? knowlarityAnalytics.value
            : null,
        elevenLabs:
          elevenLabsUsage.status === "fulfilled" ? elevenLabsUsage.value : null,
      };

      if (knowlarityAnalytics.status === "rejected") {
        Logger.warn(
          "Failed to fetch Knowlarity analytics",
          knowlarityAnalytics.reason
        );
      }

      if (elevenLabsUsage.status === "rejected") {
        Logger.warn("Failed to fetch ElevenLabs usage", elevenLabsUsage.reason);
      }

      return analytics;
    } catch (error) {
      Logger.error("Failed to fetch call analytics", error);
      throw {
        code: ERRORS.CODES.VALIDATION_ERROR,
        message: "Failed to fetch analytics data",
        original: error,
      };
    }
  }

  /**
   * Synthesize speech with ElevenLabs
   */
  async synthesizeSpeech(text, voiceId, options = {}) {
    try {
      Logger.info("Synthesizing speech", { voiceId, textLength: text.length });

      const audioBuffer = await this.elevenLabs.synthesizeSpeech(
        text,
        voiceId,
        options
      );

      return {
        success: true,
        audioBuffer,
        format: "mp3",
        size: audioBuffer.length,
      };
    } catch (error) {
      Logger.error("Failed to synthesize speech", error);
      throw {
        code: ERRORS.CODES.STREAMING_ERROR,
        message: "Failed to generate speech audio",
        original: error,
      };
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(to, message, options = {}) {
    try {
      Logger.info("Sending SMS via Twilio", { to });

      const smsData = {
        To: to,
        From: options.from || process.env.TWILIO_PHONE_NUMBER,
        Body: message,
        ...options,
      };

      const response = await this.twilio.post("/Messages.json", smsData);

      Logger.info("SMS sent successfully", {
        messageId: response.sid,
        status: response.status,
      });

      return {
        success: true,
        messageId: response.sid,
        status: response.status,
      };
    } catch (error) {
      Logger.error("Failed to send SMS", error);
      throw {
        code: ERRORS.CODES.STREAMING_ERROR,
        message: "Failed to send SMS message",
        original: error,
      };
    }
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getAvailableVoices() {
    try {
      Logger.info("Fetching available voices");

      const voices = await this.elevenLabs.getVoices();

      return {
        success: true,
        voices: voices.voices.map((voice) => ({
          id: voice.voice_id,
          name: voice.name,
          category: voice.category,
          language: voice.language,
          description: voice.description,
        })),
      };
    } catch (error) {
      Logger.error("Failed to fetch voices", error);
      throw {
        code: ERRORS.CODES.STREAMING_ERROR,
        message: "Failed to fetch available voices",
        original: error,
      };
    }
  }

  /**
   * Health check for all external APIs
   */
  async healthCheckAll() {
    try {
      Logger.info("Performing health check for all APIs");

      const healthChecks = await Promise.allSettled([
        this.elevenLabs.healthCheck(),
        this.knowlarity.healthCheck(),
        this.twilio.healthCheck(),
      ]);

      const results = {
        timestamp: new Date().toISOString(),
        services: {
          elevenLabs:
            healthChecks[0].status === "fulfilled"
              ? healthChecks[0].value
              : {
                  status: "unhealthy",
                  error: healthChecks[0].reason?.message,
                },
          knowlarity:
            healthChecks[1].status === "fulfilled"
              ? healthChecks[1].value
              : {
                  status: "unhealthy",
                  error: healthChecks[1].reason?.message,
                },
          twilio:
            healthChecks[2].status === "fulfilled"
              ? healthChecks[2].value
              : {
                  status: "unhealthy",
                  error: healthChecks[2].reason?.message,
                },
        },
      };

      const overallStatus = Object.values(results.services).every(
        (service) => service.status === "healthy"
      )
        ? "healthy"
        : "degraded";

      return {
        status: overallStatus,
        ...results,
      };
    } catch (error) {
      Logger.error("Health check failed", error);
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
module.exports = new ApiService();
