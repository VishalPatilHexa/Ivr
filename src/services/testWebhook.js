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
const { getField } = require("../utils/elevenLabsExtractor");
const { formatPhoneWithCountryCode } = require("./outboundCall");

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

function mapElevenLabsToWebhook(elevenLabsData, callRecord = null) {
  try {
    // Extract basic session info
    const sessionId = elevenLabsData.SessionID || "";
    let extractedValues = elevenLabsData.ExtractedValues || {};
    // Use the best available values

    // Use static timestamps for now
    const timestamp = Date.now();
    const startTime = new Date();
    const callDuration = extractedValues?.callDuration || 60; // Default 60 seconds
    const endTime = new Date(startTime.getTime() + callDuration * 1000);

    return {
      agentId:
        callRecord?.metadata?.agentId ||
        extractedValues?.agentId ||
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
        leadId: callRecord?.metadata?.originalRequestData['Lead DID'],
        Summary: elevenLabsData.TranscriptSummary || "",
        NAME_PATIENT: extractedValues?.patientName,
        CITY_PATIENT: extractedValues?.cityName || "N/A",
        DETAIL_TREATMENT: extractedValues?.treatmentType || "N/A",
        PATIENT_CONFIRMATION: extractedValues?.consent?.consent
          ? "Yes"
          : !extractedValues?.consent?.consent
          ? "No"
          : "N/A",
        relationship: extractedValues?.consent?.relationship || "N/A",
        opdConfirmation: extractedValues?.opdConfirmation,
        SYMPTOMS: extractedValues?.symptoms || "N/A",
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
        customParam: callRecord?.metadata?.originalRequestData,
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
    return null;
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

module.exports = {
  callTestWebhook,
  mapElevenLabsToWebhook,
};
