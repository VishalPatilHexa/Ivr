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
 * Create standardized webhook payload
 */
function createWebhookPayload(callData) {
  return {
    callTo: callData.callTo || "",
    agentId: callData.agentId || "",
    recording_url: callData.recording_url || "",
    transcript: callData.transcript || [],
    scheduleInfo: {
      campaignId: callData.scheduleInfo?.campaignId || "",
      attemptOfTheLifetime: callData.scheduleInfo?.attemptOfTheLifetime || 0,
      attemptOfTheDay: callData.scheduleInfo?.attemptOfTheDay || 0,
      customParam: {
        "Lead DID": callData.scheduleInfo?.customParam?.["Lead DID"] || "",
        "Created Time": callData.scheduleInfo?.customParam?.["Created Time"] || "",
        "Mobile": callData.scheduleInfo?.customParam?.["Mobile"] || "",
        "Page Source": callData.scheduleInfo?.customParam?.["Page Source"] || "",
        "Lead Source": callData.scheduleInfo?.customParam?.["Lead Source"] || "",
        "Lead Channel": callData.scheduleInfo?.customParam?.["Lead Channel"] || "",
        "Lead Name": callData.scheduleInfo?.customParam?.["Lead Name"] || "",
        "City": callData.scheduleInfo?.customParam?.["City"] || "",
        "Department": callData.scheduleInfo?.customParam?.["Department"] || "",
        "Condition": callData.scheduleInfo?.customParam?.["Condition"] || "",
        "Procedure": callData.scheduleInfo?.customParam?.["Procedure"] || [],
        "retryInfo": callData.scheduleInfo?.customParam?.["retryInfo"] || null,
      },
    },
    callFrom: callData.callFrom || "",
    businessId: callData.businessId || "",
    customer_crm_data: {
      "Lead Channel": callData.customer_crm_data?.["Lead Channel"] || "",
      "Lead Source": callData.customer_crm_data?.["Lead Source"] || "",
      "Page Source": callData.customer_crm_data?.["Page Source"] || "",
      "leadId": callData.customer_crm_data?.["leadId"] || "",
      "Summary": callData.customer_crm_data?.["Summary"] || "",
      "NAME_PATIENT": callData.customer_crm_data?.["NAME_PATIENT"] || "NA",
      "CITY_PATIENT": callData.customer_crm_data?.["CITY_PATIENT"] || "NA",
      "DETAIL_TREATMENT": callData.customer_crm_data?.["DETAIL_TREATMENT"] || "NA",
      "PATIENT_CONFIRMATION": callData.customer_crm_data?.["PATIENT_CONFIRMATION"] || "NA",
      "start_time": callData.customer_crm_data?.["start_time"] || "",
      "end_time": callData.customer_crm_data?.["end_time"] || "",
      "recording_url": callData.customer_crm_data?.["recording_url"] || "",
      "status": callData.customer_crm_data?.["status"] || "",
    },
    event: callData.event || "CALL_COMPLETED",
    callHistory: {
      callDuration: callData.callHistory?.callDuration || 0,
      callInitTime: callData.callHistory?.callInitTime || 0,
      callEndTime: callData.callHistory?.callEndTime || 0,
      callStatus: callData.callHistory?.callStatus || "",
      callStartTime: callData.callHistory?.callStartTime || 0,
      provider_0: callData.callHistory?.provider_0 || "",
      id: callData.callHistory?.id || "",
    },
    timestamp: callData.timestamp || Date.now(),
  };
}

/**
 * Make webhook API call
 */
async function makeWebhookCall(payload) {
  const webhookUrl = "https://api.hexahealth.com/call/v1/thirdparty/voice-bot-sync";
  
  const headers = {
    "connection": "upgrade",
    "host": "api.hexahealth.com",
    "x-forwarded-for": "3.223.179.38",
    "x-forwarded-proto": "https",
    "x-forwarded-port": "443",
    "x-amzn-trace-id": "Root=1-68db7855-0bb9be7722d1fe3e41b3e3b6",
    "accept": "text/plain, application/xml, text/xml, application/json, application/*+xml, application/*+json, */*",
    "content-type": "application/json",
    "applicationtype": "crmapi",
    "authorization": process.env.HEXAHEALTH_WEBHOOK_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NzI4NzcsIm5hbWUiOiJwYXJ0aCB0ZXN0Iiwicm9sZSI6IlRISVJEX1BBUlRZIiwic2Vjb25kYXJ5Um9sZXMiOm51bGwsIm1vYmlsZU5vIjo5OTUzODEwMTI3LCJpYXQiOjE3NDI4MjA4NzAsImV4cCI6MTgzNzQ5NTU0MH0.TYtOpu9n2-OB9l5ZWI5DS_MWHFFtWaPAxB3WzN0bgQU",
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

    if (response.status !== HTTP_STATUS.OK && response.status !== HTTP_STATUS.CREATED) {
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
      throw new Error(`Webhook service unavailable - Status: ${error.response.status}`);
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
    const dynamicVars = elevenLabsData.AllDynamicVariables || {};
    const collectedData = elevenLabsData.AllCollectedData || {};
    
    // Extract phone numbers from session ID or metadata
    const sessionId = elevenLabsData.SessionID || "";
    const callerNumber = dynamicVars.system__caller_id || extractPhoneFromSession(sessionId) || "";
    const calledNumber = dynamicVars.system__called_number || "";
    
    // Extract patient information
    const patientName = collectedData.patientName?.value || "NA";
    const cityName = extractCityFromValue(collectedData.cityName?.value) || "NA";
    const treatmentType = collectedData.treatmentType?.value || dynamicVars.treatmentType || "NA";
    const symptoms = collectedData.symptoms?.value || "NA";
    const consent = collectedData.Consent?.value || "NA";
    
    // Create timestamp
    const timestamp = new Date(elevenLabsData.Timestamp || Date.now()).getTime();
    const startTime = new Date(dynamicVars.system__time_utc || Date.now());
    const callDuration = dynamicVars.system__call_duration_secs || 0;
    const endTime = new Date(startTime.getTime() + (callDuration * 1000));
    
    return {
      callTo: calledNumber || "",
      agentId: dynamicVars.system__agent_id || "",
      recording_url: elevenLabsData.RecordingURL !== "No recording available" ? elevenLabsData.RecordingURL : "",
      transcript: generateTranscriptFromSummary(elevenLabsData.TranscriptSummary),
      scheduleInfo: {
        campaignId: "", // Not available in ElevenLabs data
        attemptOfTheLifetime: 1,
        attemptOfTheDay: 1,
        customParam: {
          "Lead DID": sessionId,
          "Created Time": startTime.toISOString(),
          "Mobile": callerNumber,
          "Page Source": "HexaHealth-IVR-Call",
          "Lead Source": "Voice Call",
          "Lead Channel": "IVR",
          "Lead Name": patientName,
          "City": cityName,
          "Department": "General",
          "Condition": treatmentType,
          "Procedure": [],
          "retryInfo": null,
        },
      },
      callFrom: callerNumber,
      businessId: "67bff39c63b61e495e90079f", // Default business ID
      customer_crm_data: {
        "Lead Channel": "IVR",
        "Lead Source": "Voice Call",
        "Page Source": "HexaHealth-IVR-Call",
        "leadId": sessionId,
        "Summary": elevenLabsData.TranscriptSummary || "",
        "NAME_PATIENT": patientName,
        "CITY_PATIENT": cityName,
        "DETAIL_TREATMENT": treatmentType,
        "PATIENT_CONFIRMATION": consent,
        "start_time": formatDateTime(startTime),
        "end_time": formatDateTime(endTime),
        "recording_url": elevenLabsData.RecordingURL !== "No recording available" ? elevenLabsData.RecordingURL : "",
        "status": "completed",
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
 * Extract phone number from session ID (if embedded)
 */
function extractPhoneFromSession(sessionId) {
  // Session ID format might include phone number
  const phoneMatch = sessionId.match(/(\d{10,15})/);
  return phoneMatch ? `+91${phoneMatch[1]}` : null;
}

/**
 * Extract city name from complex value format
 */
function extractCityFromValue(cityValue) {
  if (!cityValue) return null;
  
  // Handle formats like "{'cityName': 'Gurgaon'}"
  if (typeof cityValue === 'string' && cityValue.includes('cityName')) {
    const match = cityValue.match(/'([^']+)'/);
    return match ? match[1] : null;
  }
  
  return cityValue;
}


/**
 * Format date time for CRM
 */
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
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
      content: "Hello, मैं HexaHealth से बोल रही हूँ। आपकी क्या समस्या है?"
    },
    {
      role: "user", 
      content: "मुझे treatment की जरूरत है।"
    },
    {
      role: "system",
      content: `Call Summary: ${summary}`
    }
  ];
}

/**
 * Create sample test data for webhook testing
 */
function createSampleWebhookData() {
  return {
    callTo: "00919228041668",
    agentId: "892db09d-9a50-42e7-9f19-0a41053efb6a",
    recording_url: "https://recordings.xtremegenai.com/Hexahealth/2025/09/30/1759213584.949181_917666006788_00919228041668.wav",
    transcript: [
      {
        role: "assistant",
        content: "Hello, मैं Bhawna बोल रही हूँ HexaHealth से. Umm…… हमें आपकी query मिली है कि आप Varicose Veins का इलाज ढूंढ रहे हैं?."
      },
      {
        role: "system",
        content: "System Asked If User can hear them and the next message will be user ackowledging if they can hear the AI"
      },
      {
        role: "system",
        content: "User was silent for 6 seconds."
      },
      {
        role: "assistant",
        content: "Are you able to hear me?"
      }
    ],
    scheduleInfo: {
      campaignId: "6833f198e6648b6a72e7e730",
      attemptOfTheLifetime: 1,
      attemptOfTheDay: 1,
      customParam: {
        "Lead DID": "L265404002803622035",
        "Created Time": "2025-09-30T11:55:59+05:30",
        "Mobile": "+917666006788",
        "Page Source": "HexaHealth-Laser Varicose Veins-Mumbai-Display",
        "Lead Source": "Web Lead Form",
        "Lead Channel": "Ad - Facebook",
        "Lead Name": "Amit Kadam",
        "City": "Mumbai",
        "Department": "Vascular",
        "Condition": "Varicose Veins",
        "Procedure": [],
        "retryInfo": null
      }
    },
    callFrom: "+917666006788",
    businessId: "67bff39c63b61e495e90079f",
    customer_crm_data: {
      "Lead Channel": "Ad - Facebook",
      "Lead Source": "Web Lead Form",
      "Page Source": "HexaHealth-Laser Varicose Veins-Mumbai-Display",
      "leadId": "L265404002803622035",
      "Summary": "Customer did not speak during the call.",
      "NAME_PATIENT": "NA",
      "CITY_PATIENT": "NA",
      "DETAIL_TREATMENT": "NA",
      "PATIENT_CONFIRMATION": "NA",
      "start_time": "2025-09-30 06:26:49",
      "end_time": "2025-09-30 06:27:20",
      "recording_url": "https://recordings.xtremegenai.com/Hexahealth/2025/09/30/1759213584.949181_917666006788_00919228041668.wav",
      "status": "completed"
    },
    event: "CALL_COMPLETED",
    callHistory: {
      callDuration: 31000,
      callInitTime: 1759213584453,
      callEndTime: 1759213640000,
      callStatus: "ANSWER",
      callStartTime: 1759213609000,
      provider_0: "1759213584.949181",
      id: "68db781049449e1b0ff6bf97"
    },
    timestamp: 1759213652577
  };
}

module.exports = {
  callTestWebhook,
  createSampleWebhookData,
  mapElevenLabsToWebhook,
};