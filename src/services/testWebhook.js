/**
 * ===============================================================================
 * TEST WEBHOOK SERVICE
 * ===============================================================================
 *
 * Test function to call external webhook with standardized payload
 */

const axios = require("axios");
const Logger = require("../utils/logger");
const { HTTP_STATUS } = require("../constants");
const {
  getField,
  getFields,
  extractPhoneFromSession,
  transformers,
} = require("../utils/elevenLabsExtractor");
const {
  formatPhoneWithCountryCode,
} = require("./outboundCall");

/**
 * Test webhook call to external API
 *
 * @param {Object} callData - Call completion data
 * @param {string} callData.callTo - Customer phone number
 * @param {string} callData.callFrom - Caller phone number
 * @param {string} callData.agentId - Agent ID used for the call
 * @param {string} callData.recording_url - URL of call recording
 * @param {Array} callData.transcript - Conversation transcript
 * @param {Object} callData.scheduleInfo - Campaign and scheduling information
 * @param {string} callData.businessId - Business identifier
 * @param {Object} callData.customer_crm_data - CRM data for the customer
 * @param {string} callData.event - Event type (e.g., "CALL_COMPLETED")
 * @param {Object} callData.callHistory - Call duration and timing details
 * @param {number} callData.timestamp - Event timestamp
 * @returns {Promise<Object>} Webhook response
 */
async function callTestWebhook(callData) {
  try {
    Logger.info("🚀 Calling test webhook", {
      callTo: callData.callTo,
      event: callData.event,
      timestamp: callData.timestamp,
    });

    // Prepare standardized payload
    const payload = createWebhookPayload(callData);

    // Make webhook call
    const response = await makeWebhookCall(payload);

    Logger.info("✅ Test webhook call successful", {
      status: response.status,
      callTo: callData.callTo,
    });

    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    Logger.error("❌ Test webhook call failed", {
      error: error.message,
      callTo: callData.callTo,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create flexible webhook payload with dynamic field handling
 */
function createWebhookPayload(callData) {
  // Helper function to merge objects with fallbacks
  const safeAssign = (target, source, fallback = {}) => {
    if (!source || typeof source !== "object")
      return { ...target, ...fallback };
    return { ...target, ...source };
  };

  // Helper function to get value with fallback
  const getValue = (obj, path, fallback = "") => {
    return obj?.[path] !== undefined ? obj[path] : fallback;
  };

  return {
    // Core fields
    event: getValue(callData, "event", "CALL_COMPLETED"),
    callTo: getValue(callData, "callTo"),
    agentId: getValue(callData, "agentId"),
    callFrom: getValue(callData, "callFrom"),
    timestamp: getValue(callData, "timestamp", Date.now()),
    businessId: getValue(callData, "businessId", "67bff39c63b61e495e90079f"),

    // Transcript - pass through as-is
    transcript: Array.isArray(callData.transcript) ? callData.transcript : [],

    // Recording URL
    recording_url: getValue(callData, "recording_url"),

    // Call History - flexible object merge
    callHistory: safeAssign(
      {
        callDuration: 0,
        callInitTime: 0,
        callEndTime: 0,
        callStatus: "",
        callStartTime: 0,
        provider_0: "",
        id: "",
      },
      callData.callHistory
    ),

    // Schedule Info - flexible with custom params
    scheduleInfo: {
      campaignId: getValue(callData.scheduleInfo, "campaignId"),
      attemptOfTheLifetime: getValue(
        callData.scheduleInfo,
        "attemptOfTheLifetime",
        1
      ),
      attemptOfTheDay: getValue(callData.scheduleInfo, "attemptOfTheDay", 1),
      // Pass through all customParam fields dynamically
      customParam: safeAssign(
        {
          "Lead DID": "",
          "Created Time": "",
          Mobile: "",
          "Page Source": "HexaHealth-IVR-Call",
          "Lead Source": "Voice Call",
          "Lead Channel": "IVR",
          "Lead Name": "NA",
          City: "NA",
          Department: "",
          Condition: "NA",
          Procedure: [],
          retryInfo: null,
        },
        callData.scheduleInfo?.customParam
      ),
    },

    // Customer CRM Data - flexible with dynamic fields
    customer_crm_data: safeAssign(
      {
        "Lead Channel": "IVR",
        "Lead Source": "Voice Call",
        "Page Source": "HexaHealth-IVR-Call",
        leadId: "",
        Summary: "",
        NAME_PATIENT: "NA",
        CITY_PATIENT: "NA",
        DETAIL_TREATMENT: "NA",
        PATIENT_CONFIRMATION: "NA",
        start_time: "",
        end_time: "",
        recording_url: "",
        status: "completed",
      },
      callData.customer_crm_data
    ),
  };
}

/**
 * Make webhook API call
 */
async function makeWebhookCall(payload) {
  const webhookUrl =
    "https://stagapi.hexahealth.com/call/v1/thirdparty/voice-bot-sync";

  const headers = {
    connection: "upgrade",
    host: "stagapi.hexahealth.com",
    "x-forwarded-for": "3.223.179.38",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
    "x-amzn-trace-id": "Root=1-68db7855-0bb9be7722d1fe3e41b3e3b6",
    accept:
      "text/plain, application/xml, text/xml, application/json, application/*+xml, application/*+json, */*",
    "content-type": "application/json",
    applicationtype: "crmapi",
    authorization:
      process.env.HEXAHEALTH_WEBHOOK_TOKEN ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NzI4NzcsIm5hbWUiOiJwYXJ0aCB0ZXN0Iiwicm9sZSI6IlRISVJEX1BBUlRZIiwic2Vjb25kYXJ5Um9sZXMiOm51bGwsIm1vYmlsZU5vIjo5OTUzODEwMTI3LCJpYXQiOjE3NDI4MjA4NzAsImV4cCI6MTgzNzQ5NTU0MH0.TYtOpu9n2-OB9l5ZWI5DS_MWHFFtWaPAxB3WzN0bgQU",
    "user-agent": "Apache-HttpClient/4.5.13 (Java/17.0.14)",
    "accept-encoding": "gzip,deflate",
  };

  Logger.debug("📡 Making webhook API call", {
    url: webhookUrl,
    payload: payload,
  });

  try {
    const response = await axios.post(webhookUrl, payload, {
      headers,
      timeout: 30000, // 30 second timeout
    });

    if (
      response.status !== HTTP_STATUS.OK &&
      response.status !== HTTP_STATUS.CREATED
    ) {
      throw new Error(`Webhook call failed - Status: ${response.status}`);
    }

    return response;
  } catch (error) {
    // Handle specific error types
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new Error("Webhook call timeout");
    }

    if (error.response?.status === 429) {
      throw new Error("Webhook rate limited");
    }

    if (error.response?.status >= 500) {
      throw new Error(
        `Webhook service unavailable - Status: ${error.response.status}`
      );
    }

    // Re-throw original error if not handled above
    throw error;
  }
}

/**
 * Map ElevenLabs data to webhook payload format
 *
 * @param {Object} elevenLabsData - Data from ElevenLabs webhook
 * @returns {Object} Mapped webhook payload
 */
function mapElevenLabsToWebhook(elevenLabsData) {
  try {
    // Extract basic session info
    const sessionId = elevenLabsData.SessionID || "";

    // Extract phone numbers using the generic utility
    const rawCallerNumber =
      getField(elevenLabsData, "system__caller_id") ||
      extractPhoneFromSession(sessionId) ||
      "";
    const rawCalledNumber =
      getField(elevenLabsData, "system__called_number") || "";
    const rawCustomerNumber =
      rawCalledNumber || extractPhoneFromSession(sessionId) || "";

    // Note: Phone numbers are normalized in the database layer

    // Extract all patient/call information using the generic utility
    const extractedData = getFields(elevenLabsData, {
      patientName: { fallback: "NA" },
      cityName: { transform: transformers.city, fallback: "NA" },
      treatmentType: { fallback: "NA" },
      symptoms: { fallback: "NA" },
      consent: { transform: transformers.consent, fallback: "N/A" },
      Consent: { transform: transformers.consent, fallback: "N/A" }, // Alternative spelling
      opdConfirmation: { fallback: "NA" },
      agentId: "system__agent_id",
      callDuration: "system__call_duration_secs",
      timeUtc: "system__time_utc",
    });

    // Use the best available values
    const patientName = extractedData.patientName;
    const cityName = extractedData.cityName;
    const treatmentType =
      extractedData.treatmentType ||
      getField(elevenLabsData, "treatmentType", { source: "dynamic" }) ||
      "NA";
    const symptoms = extractedData.symptoms;
    const consent =
      extractedData.consent !== "N/A"
        ? extractedData.consent
        : extractedData.Consent;
    const opdConfirmation = extractedData.opdConfirmation;

    // Use static timestamps for now
    const timestamp = Date.now();
    const startTime = new Date();
    const callDuration = extractedData.callDuration || 60; // Default 60 seconds
    const endTime = new Date(startTime.getTime() + callDuration * 1000);

    return {
      callTo: formatPhoneWithCountryCode(rawCustomerNumber),
      agentId: extractedData.agentId || "",
      recording_url:
        "https://sr.knowlarity.com/vr/fetchsound/?callid=" + sessionId,
      transcript: generateTranscriptFromSummary(
        elevenLabsData.TranscriptSummary
      ),
      scheduleInfo: {
        campaignId: "", // Not available in ElevenLabs data
        attemptOfTheLifetime: 1,
        attemptOfTheDay: 1,
        customParam: {
          "Lead DID": "265404001082342921",
          "Created Time": startTime.toISOString(),
          Mobile: formatPhoneWithCountryCode(rawCallerNumber),
          "Page Source": "HexaHealth-IVR-Call",
          "Lead Source": "Voice Call",
          "Lead Channel": "IVR",
          "Lead Name": patientName,
          City: cityName,
          Department: "",
          Condition: treatmentType,
          Procedure: [],
          retryInfo: null,
        },
      },
      callFrom: formatPhoneWithCountryCode(rawCallerNumber),
      businessId: "67bff39c63b61e495e90079f", // Default business ID
      customer_crm_data: {
        "Lead Channel": "IVR",
        "Lead Source": "Voice Call",
        "Page Source": "HexaHealth-IVR-Call",
        leadId: "265404001082342921",
        Summary: elevenLabsData.TranscriptSummary || "",
        NAME_PATIENT: patientName,
        CITY_PATIENT: cityName,
        DETAIL_TREATMENT: treatmentType,
        PATIENT_CONFIRMATION: consent,
        opdConfirmation: opdConfirmation,
        SYMPTOMS: symptoms,
        start_time: formatDateTime(startTime),
        end_time: formatDateTime(endTime),
        recording_url:
          elevenLabsData.RecordingURL !== "No recording available"
            ? elevenLabsData.RecordingURL
            : "",
        status: "completed",
      },
      event: "CALL_COMPLETED",
      callHistory: {
        callDuration: callDuration * 1000, // Convert to milliseconds
        callInitTime: timestamp,
        callEndTime: endTime.getTime(),
        callStatus: "ANSWER",
        callStartTime: startTime.getTime(),
        provider_0: sessionId,
        id: elevenLabsData.ConversationID || sessionId,
      },
      timestamp: timestamp,
    };
  } catch (error) {
    Logger.error("❌ Failed to map ElevenLabs data to webhook", {
      error: error.message,
      elevenLabsData: elevenLabsData,
    });

    // Return basic structure with available data
    return createSampleWebhookData();
  }
}


/**
 * Format date time for CRM
 */
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Generate transcript array from summary
 */
function generateTranscriptFromSummary(summary) {
  if (!summary) return [];

  return [
    {
      role: "assistant",
      content: "Hello, मैं HexaHealth से बोल रही हूँ। आपकी क्या समस्या है?",
    },
    {
      role: "user",
      content: "मुझे treatment की जरूरत है।",
    },
    {
      role: "system",
      content: `Call Summary: ${summary}`,
    },
  ];
}

/**
 * Create sample test data for webhook testing
 */
function createSampleWebhookData() {
  return {
    callTo: "+919228041668",
    agentId: "892db09d-9a50-42e7-9f19-0a41053efb6a",
    recording_url:
      "https://recordings.xtremegenai.com/Hexahealth/2025/09/30/1759213584.949181_917666006788_00919228041668.wav",
    transcript: [
      {
        role: "assistant",
        content:
          "Hello, मैं Bhawna बोल रही हूँ HexaHealth से. Umm…… हमें आपकी query मिली है कि आप Varicose Veins का इलाज ढूंढ रहे हैं?.",
      },
      {
        role: "system",
        content:
          "System Asked If User can hear them and the next message will be user ackowledging if they can hear the AI",
      },
      {
        role: "system",
        content: "User was silent for 6 seconds.",
      },
      {
        role: "assistant",
        content: "Are you able to hear me?",
      },
    ],
    scheduleInfo: {
      campaignId: "6833f198e6648b6a72e7e730",
      attemptOfTheLifetime: 1,
      attemptOfTheDay: 1,
      customParam: {
        "Lead DID": "L265404002803622035",
        "Created Time": "2025-09-30T11:55:59+05:30",
        Mobile: "+917666006788",
        "Page Source": "HexaHealth-Laser Varicose Veins-Mumbai-Display",
        "Lead Source": "Web Lead Form",
        "Lead Channel": "Ad - Facebook",
        "Lead Name": "Amit Kadam",
        City: "Mumbai",
        Department: "Vascular",
        Condition: "Varicose Veins",
        Procedure: [],
        retryInfo: null,
      },
    },
    callFrom: "+917666006788",
    businessId: "67bff39c63b61e495e90079f",
    customer_crm_data: {
      "Lead Channel": "Ad - Facebook",
      "Lead Source": "Web Lead Form",
      "Page Source": "HexaHealth-Laser Varicose Veins-Mumbai-Display",
      leadId: "L265404002803622035",
      Summary: "Customer did not speak during the call.",
      NAME_PATIENT: "NA",
      CITY_PATIENT: "NA",
      DETAIL_TREATMENT: "NA",
      PATIENT_CONFIRMATION: "NA",
      start_time: "2025-09-30 06:26:49",
      end_time: "2025-09-30 06:27:20",
      recording_url:
        "https://recordings.xtremegenai.com/Hexahealth/2025/09/30/1759213584.949181_917666006788_00919228041668.wav",
      status: "completed",
    },
    event: "CALL_COMPLETED",
    callHistory: {
      callDuration: 31000,
      callInitTime: 1759213584453,
      callEndTime: 1759213640000,
      callStatus: "ANSWER",
      callStartTime: 1759213609000,
      provider_0: "1759213584.949181",
      id: "68db781049449e1b0ff6bf97",
    },
    timestamp: 1759213652577,
  };
}

module.exports = {
  callTestWebhook,
  createSampleWebhookData,
  mapElevenLabsToWebhook,
};
