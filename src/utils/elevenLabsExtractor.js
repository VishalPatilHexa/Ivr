/**
 * ===============================================================================
 * ELEVENLABS DATA EXTRACTOR UTILITY
 * ===============================================================================
 *
 * Generic utility for extracting and parsing any data from ElevenLabs webhooks
 * Handles Python-style dictionaries, complex objects, and nested structures
 */

const Logger = require("./logger");

/**
 * Extract all data from ElevenLabs webhook in a structured format
 * 
 * @param {Object} elevenLabsData - Raw ElevenLabs webhook data
 * @returns {Object} Structured extracted data
 */
function extractAllData(elevenLabsData) {
  try {
    const dynamicVars = elevenLabsData.AllDynamicVariables || {};
    const collectedData = elevenLabsData.AllCollectedData || {};
    
    // Parse all collected data
    const parsedCollectedData = {};
    Object.keys(collectedData).forEach(key => {
      parsedCollectedData[key] = parseComplexValue(collectedData[key]?.value);
    });
    
    // Parse all dynamic variables
    const parsedDynamicVars = {};
    Object.keys(dynamicVars).forEach(key => {
      parsedDynamicVars[key] = parseComplexValue(dynamicVars[key]);
    });
    
    return {
      sessionId: elevenLabsData.SessionID || "",
      conversationId: elevenLabsData.ConversationID || "",
      timestamp: elevenLabsData.Timestamp || new Date().toISOString(),
      recordingUrl: elevenLabsData.RecordingURL || "",
      transcriptSummary: elevenLabsData.TranscriptSummary || "",
      collectedData: parsedCollectedData,
      dynamicVariables: parsedDynamicVars,
      rawData: elevenLabsData
    };
  } catch (error) {
    Logger.error("❌ Failed to extract ElevenLabs data", {
      error: error.message,
      elevenLabsData: elevenLabsData
    });
    
    return {
      sessionId: "",
      conversationId: "",
      timestamp: new Date().toISOString(),
      recordingUrl: "",
      transcriptSummary: "",
      collectedData: {},
      dynamicVariables: {},
      rawData: elevenLabsData
    };
  }
}

/**
 * Get a specific field from ElevenLabs data with flexible fallback
 * 
 * @param {Object} elevenLabsData - Raw ElevenLabs webhook data
 * @param {string} fieldName - Name of the field to extract
 * @param {Object} options - Extraction options
 * @returns {any} Extracted field value
 */
function getField(elevenLabsData, fieldName, options = {}) {
  const {
    fallback = "NA",
    source = "auto", // "auto", "collected", "dynamic", "both"
    transform = null,
    parseComplex = true
  } = options;
  
  const dynamicVars = elevenLabsData.AllDynamicVariables || {};
  const collectedData = elevenLabsData.AllCollectedData || {};
  
  let value = fallback;
  
  // Check collected data first (usually more specific)
  if (source === "auto" || source === "collected" || source === "both") {
    if (collectedData[fieldName]?.value !== undefined) {
      value = collectedData[fieldName].value;
    }
  }
  
  // Check dynamic variables if not found in collected data
  if ((value === fallback) && (source === "auto" || source === "dynamic" || source === "both")) {
    if (dynamicVars[fieldName] !== undefined) {
      value = dynamicVars[fieldName];
    }
  }
  
  // Parse complex values if enabled
  if (parseComplex && value !== fallback) {
    value = parseComplexValue(value);
  }
  
  // Apply custom transformation
  if (transform && typeof transform === 'function') {
    value = transform(value);
  }
  
  return value;
}

/**
 * Get multiple fields at once
 * 
 * @param {Object} elevenLabsData - Raw ElevenLabs webhook data
 * @param {Array|Object} fields - Array of field names or object with field configs
 * @returns {Object} Object with extracted field values
 */
function getFields(elevenLabsData, fields) {
  const result = {};
  
  if (Array.isArray(fields)) {
    // Simple array of field names
    fields.forEach(fieldName => {
      result[fieldName] = getField(elevenLabsData, fieldName);
    });
  } else if (typeof fields === 'object') {
    // Object with field configurations
    Object.keys(fields).forEach(fieldName => {
      const config = fields[fieldName];
      if (typeof config === 'string') {
        // Simple alias: { newName: 'originalFieldName' }
        result[fieldName] = getField(elevenLabsData, config);
      } else {
        // Full configuration: { fieldName: { source: 'collected', fallback: 'default' } }
        result[fieldName] = getField(elevenLabsData, fieldName, config);
      }
    });
  }
  
  return result;
}

/**
 * Parse complex values that might be Python-style dictionaries or simple values
 * Handles Python None, True, False and converts to JavaScript equivalents
 * 
 * @param {any} value - Value to parse
 * @returns {any} Parsed value
 */
function parseComplexValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  // Handle Python-style dictionaries like "{'key': 'value', 'number': 123, 'none': None}"
  if (value.includes('{') && value.includes('}')) {
    try {
      // Replace Python keywords with JavaScript equivalents
      const cleanValue = value
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/'/g, '"'); // Convert single quotes to double quotes
      
      return JSON.parse(cleanValue);
    } catch (error) {
      // If parsing fails, return the original string
      Logger.debug("Failed to parse complex value", { value, error: error.message });
      return value;
    }
  }

  return value;
}

/**
 * Search for fields by pattern or partial name
 * 
 * @param {Object} elevenLabsData - Raw ElevenLabs webhook data
 * @param {string|RegExp} pattern - Search pattern
 * @returns {Object} Matching fields and their values
 */
function searchFields(elevenLabsData, pattern) {
  const dynamicVars = elevenLabsData.AllDynamicVariables || {};
  const collectedData = elevenLabsData.AllCollectedData || {};
  const results = {};
  
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  
  // Search in collected data
  Object.keys(collectedData).forEach(key => {
    if (regex.test(key)) {
      results[`collected_${key}`] = parseComplexValue(collectedData[key]?.value);
    }
  });
  
  // Search in dynamic variables
  Object.keys(dynamicVars).forEach(key => {
    if (regex.test(key)) {
      results[`dynamic_${key}`] = parseComplexValue(dynamicVars[key]);
    }
  });
  
  return results;
}

/**
 * Built-in transformers for common data types
 */
const transformers = {
  /**
   * Parse consent values
   */
  consent: (value) => {
    if (!value || value === "NA") return "N/A";
    
    if (typeof value === 'object' && value.consent !== undefined) {
      return value.consent === 1 ? "Yes" : value.consent === 0 ? "No" : "N/A";
    }
    
    return value;
  },

  /**
   * Parse phone numbers
   */
  phone: (value) => {
    if (!value || value === "NA") return "";
    
    if (typeof value === 'string') {
      const phoneMatch = value.match(/(\d{10,15})/);
      return phoneMatch ? `+91${phoneMatch[1]}` : value;
    }
    
    return value;
  },

  /**
   * Parse city values from complex formats
   */
  city: (value) => {
    if (!value || value === "NA") return "NA";
    
    if (typeof value === 'object' && value.cityName) {
      return value.cityName;
    }
    
    if (typeof value === 'string' && value.includes('cityName')) {
      const match = value.match(/'([^']+)'/);
      return match ? match[1] : value;
    }
    
    return value;
  },

  /**
   * Format date/time values
   */
  datetime: (value) => {
    if (!value || value === "NA") return "";
    
    if (typeof value === 'number') {
      return new Date(value * 1000).toISOString();
    }
    
    if (typeof value === 'string') {
      const date = new Date(value);
      return date.toISOString();
    }
    
    return value;
  }
};

/**
 * Helper function to extract phone number from session ID
 */
function extractPhoneFromSession(sessionId) {
  if (!sessionId) return null;
  
  const phoneMatch = sessionId.match(/(\d{10,15})/);
  return phoneMatch ? `+91${phoneMatch[1]}` : null;
}

/**
 * Extract only clean values from ElevenLabs analysis data
 * Parses complex Python-style dictionaries into JavaScript objects
 * 
 * @param {Object} elevenLabsCompleteData - Complete ElevenLabs webhook data
 * @returns {Object} Clean extracted values without rationale
 */
function extractCleanValues(elevenLabsCompleteData) {
  const extractedValues = {};
  
  if (elevenLabsCompleteData.analysis?.data_collection_results) {
    Object.keys(elevenLabsCompleteData.analysis.data_collection_results).forEach((key) => {
      const result = elevenLabsCompleteData.analysis.data_collection_results[key];
      // Parse complex values (Python-style dicts) and store clean values only
      extractedValues[key] = parseComplexValue(result.value);
    });
  }
  
  return extractedValues;
}

module.exports = {
  extractAllData,
  getField,
  getFields,
  parseComplexValue,
  searchFields,
  transformers,
  extractPhoneFromSession,
  extractCleanValues
};