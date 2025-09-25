/**
 * ===============================================================================
 * EXTERNAL API CLIENT
 * ===============================================================================
 *
 * Generic API client for external services like Twilio, webhooks, etc.
 * Provides flexible configuration for different external APIs
 */

const { createRetryClient } = require("../baseClient");
const Logger = require("../../utils/logger");
const { APPLICATION, API_ENDPOINTS, ERRORS } = require("../../constants");

class ExternalClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.authToken = config.authToken;
    this.serviceName = config.serviceName || "External API";

    // Create axios client with retry mechanism
    this.client = createRetryClient({
      baseURL: this.baseURL,
      headers: {
        ...this.getAuthHeaders(),
        ...config.headers,
      },
      ...config.clientOptions,
    });
  }

  /**
   * Get authentication headers based on provided credentials
   */
  getAuthHeaders() {
    const headers = {};

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Generic GET request
   */
  async get(endpoint, params = {}, options = {}) {
    try {
      Logger.info(`${this.serviceName} GET request`, { endpoint, params });

      const response = await this.client.get(endpoint, {
        params,
        ...options,
      });

      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} GET request failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "GET_REQUEST_FAILED");
    }
  }

  /**
   * Generic POST request
   */
  async post(endpoint, data = {}, options = {}) {
    try {
      Logger.info(`${this.serviceName} POST request`, {
        endpoint,
        dataKeys: Object.keys(data),
      });

      const response = await this.client.post(endpoint, data, options);
      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} POST request failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "POST_REQUEST_FAILED");
    }
  }

  /**
   * Generic PUT request
   */
  async put(endpoint, data = {}, options = {}) {
    try {
      Logger.info(`${this.serviceName} PUT request`, {
        endpoint,
        dataKeys: Object.keys(data),
      });

      const response = await this.client.put(endpoint, data, options);
      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} PUT request failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "PUT_REQUEST_FAILED");
    }
  }

  /**
   * Generic DELETE request
   */
  async delete(endpoint, options = {}) {
    try {
      Logger.info(`${this.serviceName} DELETE request`, { endpoint });

      const response = await this.client.delete(endpoint, options);
      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} DELETE request failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "DELETE_REQUEST_FAILED");
    }
  }

  /**
   * Generic PATCH request
   */
  async patch(endpoint, data = {}, options = {}) {
    try {
      Logger.info(`${this.serviceName} PATCH request`, {
        endpoint,
        dataKeys: Object.keys(data),
      });

      const response = await this.client.patch(endpoint, data, options);
      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} PATCH request failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "PATCH_REQUEST_FAILED");
    }
  }

  /**
   * Upload file
   */
  async uploadFile(endpoint, fileData, options = {}) {
    try {
      Logger.info(`${this.serviceName} file upload`, { endpoint });

      const formData = new FormData();

      if (fileData.buffer) {
        formData.append(
          fileData.fieldName || "file",
          fileData.buffer,
          fileData.filename
        );
      }

      // Add additional form fields
      if (fileData.fields) {
        Object.entries(fileData.fields).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      const response = await this.client.post(endpoint, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        ...options,
      });

      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} file upload failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "FILE_UPLOAD_FAILED");
    }
  }

  /**
   * Download file
   */
  async downloadFile(endpoint, options = {}) {
    try {
      Logger.info(`${this.serviceName} file download`, { endpoint });

      const response = await this.client.get(endpoint, {
        responseType: "stream",
        ...options,
      });

      return response.data;
    } catch (error) {
      Logger.error(`${this.serviceName} file download failed`, {
        endpoint,
        error,
      });
      throw this.handleError(error, "FILE_DOWNLOAD_FAILED");
    }
  }

  /**
   * Handle API errors with custom error codes
   */
  handleError(error, operationCode) {
    const customError = {
      name: `${this.serviceName}APIError`,
      operation: operationCode,
      message: error.message,
      status: error.status,
      requestId: error.requestId,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      original: error,
    };

    // Add specific error handling based on status codes
    if (error.status) {
      switch (error.status) {
        case ERRORS.HTTP_STATUS.UNAUTHORIZED:
          customError.code = ERRORS.CODES.AUTHENTICATION_FAILED;
          customError.message = `Invalid ${this.serviceName} API credentials`;
          break;
        case ERRORS.HTTP_STATUS.FORBIDDEN:
          customError.code = ERRORS.CODES.AUTHORIZATION_FAILED;
          customError.message = `Insufficient permissions for ${this.serviceName} API`;
          break;
        case ERRORS.HTTP_STATUS.RATE_LIMITED:
          customError.code = ERRORS.CODES.RATE_LIMIT_EXCEEDED;
          customError.message = `${this.serviceName} API rate limit exceeded`;
          break;
        default:
          customError.code = operationCode;
      }
    }

    return customError;
  }

  /**
   * Health check for external API
   */
  async healthCheck(healthEndpoint = "/health") {
    try {
      Logger.info(`Performing ${this.serviceName} health check`);

      await this.get(healthEndpoint);

      return {
        status: "healthy",
        service: this.serviceName,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      Logger.error(`${this.serviceName} health check failed`, error);

      return {
        status: "unhealthy",
        service: this.serviceName,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/**
 * Create Twilio client instance
 */
const createTwilioClient = () => {
  return new ExternalClient({
    baseURL: API_ENDPOINTS.EXTERNAL.TWILIO.BASE_URL,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    serviceName: "Twilio",
    clientOptions: {
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    },
  });
};

/**
 * Create generic webhook client
 */
const createWebhookClient = (webhookUrl, options = {}) => {
  return new ExternalClient({
    baseURL: webhookUrl,
    serviceName: options.serviceName || "Webhook",
    ...options,
  });
};

module.exports = {
  ExternalClient,
  createTwilioClient,
  createWebhookClient,
};
