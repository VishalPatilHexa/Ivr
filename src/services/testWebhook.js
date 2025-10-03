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
const { formatPhoneWithCountryCode } = require("./outboundCall");

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

    // Make webhook call
    const response = await makeWebhookCall(callData);

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
 * @param {Object} callRecord - Optional call record from ivr_calls table
 * @returns {Object} Mapped webhook payload
 */
function mapElevenLabsToWebhook(elevenLabsData, callRecord = null) {
  try {
    // Extract basic session info
    const sessionId = elevenLabsData.SessionID || "";
    // Use the best available values
    const patientName = elevenLabsData?.extractedValues?.patientName;
    const cityName = elevenLabsData?.extractedValues?.cityName;
    const treatmentType =
      elevenLabsData?.extractedValues?.treatmentType ||
      getField(elevenLabsData, "treatmentType", { source: "dynamic" }) ||
      "NA";
    const symptoms = elevenLabsData?.extractedValues?.symptoms;
    const consent =
      elevenLabsData?.extractedValues?.consent !== "N/A"
        ? elevenLabsData?.extractedValues?.consent
        : elevenLabsData?.extractedValues?.Consent;
    const opdConfirmation = elevenLabsData?.extractedValues?.opdConfirmation;

    // Use static timestamps for now
    const timestamp = Date.now();
    const startTime = new Date();
    const callDuration = elevenLabsData?.extractedValues?.callDuration || 60; // Default 60 seconds
    const endTime = new Date(startTime.getTime() + callDuration * 1000);

    return {
      agentId:
        callRecord?.originalRequestData?.agentId ||
        elevenLabsData?.extractedValues?.agentId ||
        "",
      businessId: "67bff39c63b61e495e90079f", // Default business ID
      callFrom: formatPhoneWithCountryCode(callRecord?.callerNumber),
      callHistory: {
        callDuration: callDuration,
        callEndTime: 1759473414000,
        callInitTime: 1759473341861,
        callStartTime: 1759473358000,
        callStatus: "ANSWER",
        id: "68df6ebd2b83d63e2441de9f",
        provider_0: "1759473341.993096",
      },
      callTo: formatPhoneWithCountryCode(callRecord?.customerNumber),
      customer_crm_data: {
        "Lead Channel": "Ad - Facebook",
        "Lead Source": "Web Lead Form",
        "Page Source": "None",
        leadId: "L" + callData?.originalRequestData?.leadId,
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
      recording_url:
        "https://sr.knowlarity.com/vr/fetchsound/?callid=" + sessionId,
      scheduleInfo: {
        attemptOfTheDay: 1,
        attemptOfTheLifetime: 1,
        campaignId: null,
        customParam: callRecord?.originalRequestData?.custom_field,
      },
      timestamp: timestamp,
      transcript: generateTranscriptFromSummary(
        elevenLabsData.TranscriptSummary
      ),
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
