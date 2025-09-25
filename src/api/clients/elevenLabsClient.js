/**
 * ===============================================================================
 * ELEVENLABS API CLIENT
 * ===============================================================================
 *
 * Specialized axios client for ElevenLabs API interactions
 * Handles authentication, voice synthesis, and conversation management
 */

const { createRetryClient } = require("../baseClient");
const Logger = require("../../utils/logger");
const { APPLICATION, API_ENDPOINTS, ERRORS } = require("../../constants");

class ElevenLabsClient {
  constructor() {
    this.apiKey = APPLICATION.API_KEYS.ELEVENLABS;
    this.baseURL = API_ENDPOINTS.ELEVENLABS.BASE_URL;

    if (!this.apiKey) {
      throw new Error("ElevenLabs API key is required");
    }

    // Create axios client with retry mechanism
    this.client = createRetryClient({
      baseURL: this.baseURL,
      headers: {
        "xi-api-key": this.apiKey,
        Accept: "application/json",
      },
    });
  }

  /**
   * Get available voices
   */
  async getVoices() {
    try {
      Logger.info("Fetching ElevenLabs voices");
      const response = await this.client.get(API_ENDPOINTS.ELEVENLABS.VOICES);
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch ElevenLabs voices", error);
      throw this.handleError(error, "FETCH_VOICES_FAILED");
    }
  }

  /**
   * Get voice by ID
   */
  async getVoice(voiceId) {
    try {
      Logger.info("Fetching ElevenLabs voice", { voiceId });
      const response = await this.client.get(
        `${API_ENDPOINTS.ELEVENLABS.VOICES}/${voiceId}`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch ElevenLabs voice", { voiceId, error });
      throw this.handleError(error, "FETCH_VOICE_FAILED");
    }
  }

  /**
   * Get available agents
   */
  async getAgents() {
    try {
      Logger.info("Fetching ElevenLabs agents");
      const response = await this.client.get(API_ENDPOINTS.ELEVENLABS.AGENTS);
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch ElevenLabs agents", error);
      throw this.handleError(error, "FETCH_AGENTS_FAILED");
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId) {
    try {
      Logger.info("Fetching ElevenLabs agent", { agentId });
      const response = await this.client.get(
        `${API_ENDPOINTS.ELEVENLABS.AGENTS}/${agentId}`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch ElevenLabs agent", { agentId, error });
      throw this.handleError(error, "FETCH_AGENT_FAILED");
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(agentId, sessionData = {}) {
    try {
      Logger.info("Creating ElevenLabs conversation", { agentId, sessionData });

      const payload = {
        agent_id: agentId,
        session_id: sessionData.sessionId,
        ...sessionData,
      };

      const response = await this.client.post(
        API_ENDPOINTS.ELEVENLABS.CONVERSATIONS,
        payload
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to create ElevenLabs conversation", {
        agentId,
        error,
      });
      throw this.handleError(error, "CREATE_CONVERSATION_FAILED");
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId) {
    try {
      Logger.info("Fetching ElevenLabs conversation", { conversationId });
      const response = await this.client.get(
        `${API_ENDPOINTS.ELEVENLABS.CONVERSATIONS}/${conversationId}`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch ElevenLabs conversation", {
        conversationId,
        error,
      });
      throw this.handleError(error, "FETCH_CONVERSATION_FAILED");
    }
  }

  /**
   * Text-to-Speech synthesis
   */
  async synthesizeSpeech(text, voiceId, options = {}) {
    try {
      Logger.info("Synthesizing speech with ElevenLabs", {
        voiceId,
        textLength: text.length,
      });

      const payload = {
        text,
        model_id: options.modelId || "eleven_monolingual_v1",
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarityBoost || 0.8,
          style: options.style || 0.0,
          use_speaker_boost: options.useSpeakerBoost || true,
        },
        ...options,
      };

      const response = await this.client.post(
        `${API_ENDPOINTS.ELEVENLABS.SPEECH}/${voiceId}`,
        payload,
        {
          responseType: "arraybuffer",
          headers: {
            Accept: "audio/mpeg",
          },
        }
      );

      return response.data;
    } catch (error) {
      Logger.error("Failed to synthesize speech", { voiceId, error });
      throw this.handleError(error, "SPEECH_SYNTHESIS_FAILED");
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(filters = {}) {
    try {
      Logger.info("Fetching ElevenLabs conversation history", filters);

      const params = {
        page_size: filters.pageSize || 100,
        start_after_history_item_id: filters.startAfter,
        ...filters,
      };

      const response = await this.client.get(API_ENDPOINTS.ELEVENLABS.HISTORY, {
        params,
      });
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch conversation history", error);
      throw this.handleError(error, "FETCH_HISTORY_FAILED");
    }
  }

  /**
   * Delete conversation history item
   */
  async deleteHistoryItem(historyItemId) {
    try {
      Logger.info("Deleting ElevenLabs history item", { historyItemId });
      const response = await this.client.delete(
        `${API_ENDPOINTS.ELEVENLABS.HISTORY}/${historyItemId}`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to delete history item", { historyItemId, error });
      throw this.handleError(error, "DELETE_HISTORY_FAILED");
    }
  }

  /**
   * Get user subscription info
   */
  async getSubscription() {
    try {
      Logger.info("Fetching ElevenLabs subscription info");
      const response = await this.client.get("/user/subscription");
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch subscription info", error);
      throw this.handleError(error, "FETCH_SUBSCRIPTION_FAILED");
    }
  }

  /**
   * Get usage statistics
   */
  async getUsage() {
    try {
      Logger.info("Fetching ElevenLabs usage statistics");
      const response = await this.client.get("/user/usage");
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch usage statistics", error);
      throw this.handleError(error, "FETCH_USAGE_FAILED");
    }
  }

  /**
   * Handle API errors with custom error codes
   */
  handleError(error, operationCode) {
    const customError = {
      name: "ElevenLabsAPIError",
      operation: operationCode,
      message: error.message,
      status: error.status,
      requestId: error.requestId,
      timestamp: new Date().toISOString(),
      original: error,
    };

    // Add specific error handling based on status codes
    if (error.status) {
      switch (error.status) {
        case ERRORS.HTTP_STATUS.UNAUTHORIZED:
          customError.code = ERRORS.CODES.AUTHENTICATION_FAILED;
          customError.message = "Invalid or expired ElevenLabs API key";
          break;
        case ERRORS.HTTP_STATUS.FORBIDDEN:
          customError.code = ERRORS.CODES.AUTHORIZATION_FAILED;
          customError.message = "Insufficient permissions for ElevenLabs API";
          break;
        case ERRORS.HTTP_STATUS.RATE_LIMITED:
          customError.code = ERRORS.CODES.RATE_LIMIT_EXCEEDED;
          customError.message = "ElevenLabs API rate limit exceeded";
          break;
        default:
          customError.code = operationCode;
      }
    }

    return customError;
  }

  /**
   * Health check for ElevenLabs API
   */
  async healthCheck() {
    try {
      Logger.info("Performing ElevenLabs API health check");

      // Try to fetch voices as a simple health check
      await this.getVoices();

      return {
        status: "healthy",
        service: "ElevenLabs API",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      Logger.error("ElevenLabs API health check failed", error);

      return {
        status: "unhealthy",
        service: "ElevenLabs API",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
module.exports = new ElevenLabsClient();
