/**
 * ===============================================================================
 * BASE API CLIENT
 * ===============================================================================
 *
 * Base axios client with interceptors, error handling, and retry logic
 * Used as foundation for all API clients in the application
 */

const axios = require("axios");
const Logger = require("../utils/logger");
const { APPLICATION, ERRORS } = require("../constants");

/**
 * Create base axios instance with default configuration
 */
const createBaseClient = (config = {}) => {
  const client = axios.create({
    timeout: APPLICATION.API_CONFIG.TIMEOUT,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `IVR-System/${APPLICATION.API_VERSION}`,
      ...config.headers,
    },
    ...config,
  });

  // Request interceptor
  client.interceptors.request.use(
    (config) => {
      // Add request ID for tracing
      config.headers["X-Request-ID"] = generateRequestId();

      // Log outgoing request
      Logger.info("API Request", {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        headers: sanitizeHeaders(config.headers),
        requestId: config.headers["X-Request-ID"],
      });

      return config;
    },
    (error) => {
      Logger.error("API Request Error", error);
      return Promise.reject(error);
    }
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => {
      // Log successful response
      Logger.info("API Response Success", {
        status: response.status,
        statusText: response.statusText,
        url: response.config.url,
        method: response.config.method?.toUpperCase(),
        requestId: response.config.headers["X-Request-ID"],
        responseTime: Date.now() - response.config.metadata?.startTime,
      });

      return response;
    },
    async (error) => {
      const requestId = error.config?.headers?.["X-Request-ID"];

      // Log error response
      Logger.error("API Response Error", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        requestId,
        data: error.response?.data,
      });

      // Handle specific HTTP errors
      if (error.response) {
        const { status, data } = error.response;

        switch (status) {
          case ERRORS.HTTP_STATUS.UNAUTHORIZED:
            Logger.warn("API Unauthorized Access", {
              requestId,
              url: error.config?.url,
            });
            break;
          case ERRORS.HTTP_STATUS.FORBIDDEN:
            Logger.warn("API Forbidden Access", {
              requestId,
              url: error.config?.url,
            });
            break;
          case ERRORS.HTTP_STATUS.NOT_FOUND:
            Logger.warn("API Resource Not Found", {
              requestId,
              url: error.config?.url,
            });
            break;
          case ERRORS.HTTP_STATUS.RATE_LIMITED:
            Logger.warn("API Rate Limited", {
              requestId,
              url: error.config?.url,
            });
            break;
          case ERRORS.HTTP_STATUS.INTERNAL_ERROR:
            Logger.error("API Internal Server Error", {
              requestId,
              url: error.config?.url,
              data,
            });
            break;
        }
      }

      // Transform error for consistent handling
      const transformedError = transformApiError(error);
      return Promise.reject(transformedError);
    }
  );

  return client;
};

/**
 * Create API client with retry mechanism
 */
const createRetryClient = (config = {}) => {
  const client = createBaseClient(config);

  // Add retry functionality
  client.interceptors.response.use(undefined, async (error) => {
    const { config: requestConfig } = error;

    if (!requestConfig || !shouldRetry(error)) {
      return Promise.reject(error);
    }

    // Initialize retry count
    requestConfig.__retryCount = requestConfig.__retryCount || 0;

    if (requestConfig.__retryCount >= APPLICATION.API_CONFIG.RETRY_ATTEMPTS) {
      Logger.error("API Max Retry Attempts Reached", {
        url: requestConfig.url,
        retryCount: requestConfig.__retryCount,
        requestId: requestConfig.headers["X-Request-ID"],
      });
      return Promise.reject(error);
    }

    // Increment retry count
    requestConfig.__retryCount += 1;

    // Calculate delay with exponential backoff
    const delay = calculateRetryDelay(requestConfig.__retryCount);

    Logger.info("API Retrying Request", {
      url: requestConfig.url,
      attempt: requestConfig.__retryCount,
      delay,
      requestId: requestConfig.headers["X-Request-ID"],
    });

    // Wait before retry
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Retry the request
    return client(requestConfig);
  });

  return client;
};

/**
 * Generate unique request ID for tracing
 */
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Sanitize headers for logging (remove sensitive data)
 */
const sanitizeHeaders = (headers) => {
  const sanitized = { ...headers };
  const sensitiveHeaders = [
    "authorization",
    "x-api-key",
    "xi-api-key",
    "cookie",
  ];

  sensitiveHeaders.forEach((header) => {
    const key = Object.keys(sanitized).find((k) => k.toLowerCase() === header);
    if (key && sanitized[key]) {
      sanitized[key] = "[REDACTED]";
    }
  });

  return sanitized;
};

/**
 * Transform API errors to consistent format
 */
const transformApiError = (error) => {
  const transformed = {
    name: "APIError",
    message: error.message,
    code: error.code,
    requestId: error.config?.headers?.["X-Request-ID"],
    url: error.config?.url,
    method: error.config?.method?.toUpperCase(),
    original: error,
  };

  if (error.response) {
    transformed.status = error.response.status;
    transformed.statusText = error.response.statusText;
    transformed.data = error.response.data;

    // Extract meaningful error message
    if (error.response.data) {
      if (typeof error.response.data === "string") {
        transformed.message = error.response.data;
      } else if (error.response.data.message) {
        transformed.message = error.response.data.message;
      } else if (error.response.data.error) {
        transformed.message = error.response.data.error;
      }
    }
  }

  return transformed;
};

/**
 * Determine if request should be retried
 */
const shouldRetry = (error) => {
  // Don't retry client errors (4xx)
  if (
    error.response &&
    error.response.status >= 400 &&
    error.response.status < 500
  ) {
    return false;
  }

  // Retry on network errors, timeouts, and server errors (5xx)
  return (
    !error.response || // Network error
    error.code === "ECONNABORTED" || // Timeout
    error.response.status >= 500 // Server error
  );
};

/**
 * Calculate retry delay with exponential backoff
 */
const calculateRetryDelay = (attempt) => {
  const baseDelay = APPLICATION.API_CONFIG.RETRY_DELAY;
  const maxDelay = APPLICATION.API_CONFIG.MAX_RETRY_DELAY;

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000; // Add up to 1 second jitter

  return Math.min(exponentialDelay + jitter, maxDelay);
};

module.exports = {
  createBaseClient,
  createRetryClient,
  generateRequestId,
  transformApiError,
};
