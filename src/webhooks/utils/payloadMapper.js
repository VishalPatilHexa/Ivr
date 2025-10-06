/**
 * ===============================================================================
 * WEBHOOK PAYLOAD MAPPER
 * ===============================================================================
 *
 * Reusable utilities for mapping data to webhook payload formats
 */

const Logger = require("../../utils/logger");

/**
 * Format date time for CRM (YYYY-MM-DD HH:MM:SS)
 */
function formatDateTime(date) {
  if (!date) return "";

  const d = date instanceof Date ? date : new Date(date);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format phone number with country code
 */
function formatPhoneWithCountryCode(phoneNumber, countryCode = "+91") {
  if (!phoneNumber) return "";

  const cleaned = String(phoneNumber).replace(/\D/g, "");

  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  if (cleaned.length === 10) {
    return `${countryCode}${cleaned}`;
  }

  return phoneNumber;
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
 * Calculate call times from duration
 */
function calculateCallTimes(callDuration = 60) {
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + callDuration * 1000);

  return {
    startTime,
    endTime,
    duration: callDuration,
  };
}

/**
 * Extract consent information from extracted values
 */
function extractConsentInfo(extractedValues) {
  const consent = extractedValues?.consent;

  if (!consent) {
    return {
      confirmation: "N/A",
      relationship: "N/A",
    };
  }

  return {
    confirmation: consent.consent
      ? "Yes"
      : consent.consent === false
      ? "No"
      : "N/A",
    relationship: consent.relationship || "N/A",
  };
}

/**
 * Build call history object
 */
function buildCallHistory(callDuration = 60) {
  const now = Date.now();
  const startTime = now - callDuration * 1000;

  return {
    callDuration: callDuration,
    callEndTime: now,
    callInitTime: startTime - 17000, // 17 seconds before start
    callStartTime: startTime,
    callStatus: "ANSWER",
    id: generateMockId(),
    provider_0: `${Math.floor(Date.now() / 1000)}.${Math.floor(
      Math.random() * 1000000
    )}`,
  };
}

/**
 * Generate mock ID for testing
 */
function generateMockId() {
  return `${Math.floor(Date.now() / 1000).toString(16)}${Math.random()
    .toString(16)
    .substring(2, 10)}`;
}

/**
 * Build customer CRM data object
 */
function buildCustomerCrmData(elevenLabsData, callRecord, times) {
  const extractedValues = elevenLabsData.ExtractedValues || {};
  const consentInfo = extractConsentInfo(extractedValues);
  const originalRequestData = callRecord?.metadata?.originalRequestData || {};

  return {
    "Lead Channel": originalRequestData["Lead Channel"],
    "Lead Source": originalRequestData["Lead Source"],
    "Page Source": originalRequestData["Page Source"],
    leadId: originalRequestData["Lead DID"],
    Summary: elevenLabsData.TranscriptSummary || "",
    NAME_PATIENT: extractedValues?.patientName,
    CITY_PATIENT: extractedValues?.cityName || "N/A",
    DETAIL_TREATMENT: extractedValues?.treatmentType || "N/A",
    PATIENT_CONFIRMATION: consentInfo.confirmation,
    relationship: consentInfo.relationship,
    opdConfirmation: extractedValues?.opdConfirmation,
    SYMPTOMS: extractedValues?.symptoms || "N/A",
    start_time: formatDateTime(times.startTime),
    end_time: formatDateTime(times.endTime),
    recording_url:
      elevenLabsData.RecordingURL !== "No recording available"
        ? elevenLabsData.RecordingURL
        : "",
    status: "completed",
  };
}

/**
 * Build schedule info object
 */
function buildScheduleInfo(callRecord) {
  return {
    attemptOfTheDay: 1,
    attemptOfTheLifetime: 1,
    campaignId: null,
    customParam: callRecord?.metadata?.originalRequestData || {},
  };
}

/**
 * Map ElevenLabs data to webhook payload format
 */
function mapElevenLabsToWebhook(elevenLabsData, callRecord = null) {
  try {
    Logger.debug("📦 Mapping ElevenLabs data to webhook format", {
      sessionId: elevenLabsData.SessionID,
      hasCallRecord: !!callRecord,
    });

    const extractedValues = elevenLabsData.ExtractedValues || {};
    const callDuration = extractedValues?.callDuration || 60;
    const times = calculateCallTimes(callDuration);
    const callHistory = buildCallHistory(callDuration);

    const payload = {
      agentId: callRecord?.metadata?.agentId || extractedValues?.agentId || "",
      businessId: "67bff39c63b61e495e90079f", // Default business ID
      callFrom: formatPhoneWithCountryCode(callRecord?.callerNumber),
      callHistory: callHistory,
      callTo: formatPhoneWithCountryCode(callRecord?.customerNumber),
      customer_crm_data: buildCustomerCrmData(
        elevenLabsData,
        callRecord,
        times
      ),
      event: "CALL_COMPLETED",
      recording_url: `https://sr.knowlarity.com/vr/fetchsound/?callid=${elevenLabsData.SessionID}`,
      scheduleInfo: buildScheduleInfo(callRecord),
      timestamp: Date.now(),
      transcript: generateTranscriptFromSummary(
        elevenLabsData.TranscriptSummary
      ),
    };

    Logger.debug("✅ Webhook payload mapped successfully", {
      sessionId: elevenLabsData.SessionID,
    });

    return payload;
  } catch (error) {
    Logger.error("❌ Failed to map ElevenLabs data to webhook", {
      error: error.message,
      sessionId: elevenLabsData.SessionID,
    });

    return null;
  }
}

module.exports = {
  formatDateTime,
  formatPhoneWithCountryCode,
  generateTranscriptFromSummary,
  calculateCallTimes,
  extractConsentInfo,
  buildCallHistory,
  buildCustomerCrmData,
  buildScheduleInfo,
  mapElevenLabsToWebhook,
};
