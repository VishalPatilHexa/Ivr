/**
 * ===============================================================================
 * KNOWLARITY API CLIENT
 * ===============================================================================
 *
 * Specialized axios client for Knowlarity API interactions
 * Handles call management, webhooks, and telephony operations
 */

const { createRetryClient } = require("../baseClient");
const Logger = require("../../utils/logger");
const { APPLICATION, API_ENDPOINTS, ERRORS } = require("../../constants");
const crypto = require("crypto");

class KnowlarityClient {
  constructor() {
    this.apiKey = process.env.KNOWLARITY_API_KEY;
    this.authToken = process.env.KNOWLARITY_AUTH_TOKEN;
    this.baseURL = API_ENDPOINTS.KNOWLARITY.BASE_URL;

    if (!this.apiKey || !this.authToken) {
      Logger.warn("Knowlarity API credentials not configured");
    }

    // Create axios client with retry mechanism
    this.client = createRetryClient({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "X-API-Key": this.apiKey,
        Accept: "application/json",
      },
    });
  }

  /**
   * Make outbound call
   */
  async makeOutboundCall(callData) {
    try {
      Logger.info("Making outbound call via Knowlarity", {
        to: callData.to,
        from: callData.from,
      });

      const payload = {
        k_number: callData.from,
        customer_number: callData.to,
        agent_number: callData.agentNumber,
        call_type: callData.callType || "outbound",
        session_id: callData.sessionId,
        webhook_url: callData.webhookUrl,
        ...callData,
      };

      const response = await this.client.post(
        API_ENDPOINTS.KNOWLARITY.OUTBOUND_CALL,
        payload
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to make outbound call", { callData, error });
      throw this.handleError(error, "OUTBOUND_CALL_FAILED");
    }
  }

  /**
   * Get call logs
   */
  async getCallLogs(filters = {}) {
    try {
      Logger.info("Fetching Knowlarity call logs", filters);

      const params = {
        start_date: filters.startDate,
        end_date: filters.endDate,
        k_number: filters.kNumber,
        customer_number: filters.customerNumber,
        call_type: filters.callType,
        page: filters.page || 1,
        limit: filters.limit || 100,
        ...filters,
      };

      const response = await this.client.get(
        API_ENDPOINTS.KNOWLARITY.CALL_LOGS,
        { params }
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch call logs", error);
      throw this.handleError(error, "FETCH_CALL_LOGS_FAILED");
    }
  }

  /**
   * Get call details by ID
   */
  async getCallDetails(callId) {
    try {
      Logger.info("Fetching Knowlarity call details", { callId });
      const response = await this.client.get(
        `${API_ENDPOINTS.KNOWLARITY.CALL_LOGS}/${callId}`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch call details", { callId, error });
      throw this.handleError(error, "FETCH_CALL_DETAILS_FAILED");
    }
  }

  /**
   * Get available phone numbers
   */
  async getPhoneNumbers(filters = {}) {
    try {
      Logger.info("Fetching Knowlarity phone numbers", filters);

      const params = {
        type: filters.type, // 'local', 'toll_free', 'mobile'
        country_code: filters.countryCode,
        state: filters.state,
        city: filters.city,
        available: filters.available,
        ...filters,
      };

      const response = await this.client.get(
        API_ENDPOINTS.KNOWLARITY.PHONE_NUMBERS,
        { params }
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch phone numbers", error);
      throw this.handleError(error, "FETCH_PHONE_NUMBERS_FAILED");
    }
  }

  /**
   * Configure phone number settings
   */
  async configurePhoneNumber(phoneNumber, config) {
    try {
      Logger.info("Configuring Knowlarity phone number", {
        phoneNumber,
        config,
      });

      const payload = {
        k_number: phoneNumber,
        webhook_url: config.webhookUrl,
        call_flow: config.callFlow,
        recording: config.recording || false,
        transcription: config.transcription || false,
        ...config,
      };

      const response = await this.client.put(
        `${API_ENDPOINTS.KNOWLARITY.PHONE_NUMBERS}/${phoneNumber}`,
        payload
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to configure phone number", { phoneNumber, error });
      throw this.handleError(error, "CONFIGURE_PHONE_FAILED");
    }
  }

  /**
   * End active call
   */
  async endCall(callId) {
    try {
      Logger.info("Ending Knowlarity call", { callId });
      const response = await this.client.post(
        `${API_ENDPOINTS.KNOWLARITY.CALL_LOGS}/${callId}/end`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to end call", { callId, error });
      throw this.handleError(error, "END_CALL_FAILED");
    }
  }

  /**
   * Transfer call to another number
   */
  async transferCall(callId, transferData) {
    try {
      Logger.info("Transferring Knowlarity call", { callId, transferData });

      const payload = {
        transfer_to: transferData.transferTo,
        transfer_type: transferData.transferType || "warm", // 'warm' or 'cold'
        ...transferData,
      };

      const response = await this.client.post(
        `${API_ENDPOINTS.KNOWLARITY.CALL_LOGS}/${callId}/transfer`,
        payload
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to transfer call", { callId, error });
      throw this.handleError(error, "TRANSFER_CALL_FAILED");
    }
  }

  /**
   * Get call recording URL
   */
  async getCallRecording(callId) {
    try {
      Logger.info("Fetching Knowlarity call recording", { callId });
      const response = await this.client.get(
        `${API_ENDPOINTS.KNOWLARITY.CALL_LOGS}/${callId}/recording`
      );
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch call recording", { callId, error });
      throw this.handleError(error, "FETCH_RECORDING_FAILED");
    }
  }

  /**
   * Get call analytics
   */
  async getCallAnalytics(filters = {}) {
    try {
      Logger.info("Fetching Knowlarity call analytics", filters);

      const params = {
        start_date: filters.startDate,
        end_date: filters.endDate,
        group_by: filters.groupBy || "day", // 'hour', 'day', 'week', 'month'
        metrics: filters.metrics || [
          "total_calls",
          "answered_calls",
          "missed_calls",
        ],
        ...filters,
      };

      const response = await this.client.get("/analytics/calls", { params });
      return response.data;
    } catch (error) {
      Logger.error("Failed to fetch call analytics", error);
      throw this.handleError(error, "FETCH_ANALYTICS_FAILED");
    }
  }

  /**
   * Validate webhook signature (for incoming webhooks)
   */
  validateWebhookSignature(payload, signature, secret = null) {
    try {
      const webhookSecret = secret || process.env.KNOWLARITY_WEBHOOK_SECRET;

      if (!webhookSecret) {
        Logger.warn("Knowlarity webhook secret not configured");
        return false;
      }

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(payload))
        .digest("hex");

      return signature === expectedSignature;
    } catch (error) {
      Logger.error("Failed to validate webhook signature", error);
      return false;
    }
  }

  /**
   * Handle API errors with custom error codes
   */
  handleError(error, operationCode) {
    const customError = {
      name: "KnowlarityAPIError",
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
          customError.message = "Invalid Knowlarity API credentials";
          break;
        case ERRORS.HTTP_STATUS.FORBIDDEN:
          customError.code = ERRORS.CODES.AUTHORIZATION_FAILED;
          customError.message = "Insufficient permissions for Knowlarity API";
          break;
        case ERRORS.HTTP_STATUS.RATE_LIMITED:
          customError.code = ERRORS.CODES.RATE_LIMIT_EXCEEDED;
          customError.message = "Knowlarity API rate limit exceeded";
          break;
        default:
          customError.code = operationCode;
      }
    }

    return customError;
  }

  /**
   * Health check for Knowlarity API
   */
  async healthCheck() {
    try {
      Logger.info("Performing Knowlarity API health check");

      // Try to fetch phone numbers as a simple health check
      await this.getPhoneNumbers({ limit: 1 });

      return {
        status: "healthy",
        service: "Knowlarity API",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      Logger.error("Knowlarity API health check failed", error);

      return {
        status: "unhealthy",
        service: "Knowlarity API",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
module.exports = new KnowlarityClient();
