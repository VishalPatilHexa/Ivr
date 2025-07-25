/*
 * ===============================================================================
 * DEFAULT PATIENT DATA CONFIGURATION
 * ===============================================================================
 * 
 * PURPOSE: Centralized configuration for default patient metadata
 * 
 * USAGE: When no patient metadata is provided, these defaults will be used
 * to ensure ElevenLabs dynamic variables are always populated with meaningful data
 * 
 * CUSTOMIZATION: Modify these values to match your use case requirements
 * 
 * ===============================================================================
 */

const DEFAULT_PATIENT_DATA = {
  // Primary treatment information
  treatmentType: 'Heart Surgery',
  appointmentType: 'phone_consultation',
  
  // Patient demographics
  patientName: 'Vishal Patil',
  patientAge: '30',
  
  // Medical information
  symptoms: 'Heart related consultation needed for cardiac evaluation',
  medicalHistory: 'No major medical history, first time consultation',
  
  // Healthcare provider
  doctorName: 'Dr. Sharma',
  
  // Additional instructions
  customInstructions: 'Please provide detailed consultation in Hindi language',
  
  // System settings
  language: 'hindi',
};

/**
 * Get default patient data with optional overrides
 * 
 * @param {object} overrides - Values to override defaults
 * @returns {object} Merged default and override values
 */
function getDefaultPatientData(overrides = {}) {
  return {
    ...DEFAULT_PATIENT_DATA,
    ...overrides
  };
}

/**
 * Validate patient data structure
 * 
 * @param {object} patientData - Patient data to validate
 * @returns {object} Validation result with errors if any
 */
function validatePatientData(patientData) {
  const errors = [];
  const requiredFields = ['treatmentType', 'patientName'];
  
  requiredFields.forEach(field => {
    if (!patientData[field] || patientData[field].trim() === '') {
      errors.push(`${field} is required`);
    }
  });
  
  // Age validation
  if (patientData.patientAge && isNaN(patientData.patientAge)) {
    errors.push('patientAge must be a number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get patient data for different client types
 * 
 * @param {string} clientType - Type of client (web_client, knowlarity, etc.)
 * @param {object} providedData - Data provided by client
 * @returns {object} Appropriate patient data for client type
 */
function getPatientDataForClientType(clientType, providedData = {}) {
  let baseDefaults = { ...DEFAULT_PATIENT_DATA };
  
  // Customize defaults based on client type
  switch (clientType) {
    case 'web_client':
      baseDefaults.appointmentType = 'web_consultation';
      baseDefaults.customInstructions = 'Please provide detailed consultation in Hindi for web client';
      break;
      
    case 'knowlarity':
      baseDefaults.appointmentType = 'phone_consultation';
      baseDefaults.customInstructions = 'Please provide detailed consultation in Hindi for phone call';
      break;
      
    default:
      baseDefaults.appointmentType = 'general_consultation';
  }
  
  return getDefaultPatientData({ ...baseDefaults, ...providedData });
}

/**
 * Format patient data for ElevenLabs dynamic variables
 * 
 * @param {object} patientData - Patient data to format
 * @returns {object} Formatted data for ElevenLabs
 */
function formatForElevenLabs(patientData) {
  const finalData = getDefaultPatientData(patientData);
  
  return {
    treatmentType: finalData.treatmentType,
    patientName: finalData.patientName,
    patientAge: finalData.patientAge.toString(),
    symptoms: finalData.symptoms,
    medicalHistory: finalData.medicalHistory,
    appointmentType: finalData.appointmentType,
    doctorName: finalData.doctorName,
    customInstructions: finalData.customInstructions,
    // Additional context for the AI
    patientContext: `Patient ${finalData.patientName}, age ${finalData.patientAge}, seeking ${finalData.treatmentType} consultation with ${finalData.doctorName}. Symptoms: ${finalData.symptoms}`,
    consultationMode: 'voice_conversation'
  };
}

/**
 * Environment-based default overrides
 * Load different defaults based on NODE_ENV
 */
function getEnvironmentDefaults() {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return {
        patientName: process.env.DEFAULT_PATIENT_NAME || DEFAULT_PATIENT_DATA.patientName,
        doctorName: process.env.DEFAULT_DOCTOR_NAME || DEFAULT_PATIENT_DATA.doctorName,
        treatmentType: process.env.DEFAULT_TREATMENT_TYPE || DEFAULT_PATIENT_DATA.treatmentType
      };
      
    case 'staging':
      return {
        patientName: 'Test Patient',
        doctorName: 'Dr. Test',
        treatmentType: 'Test Consultation'
      };
      
    case 'development':
    default:
      return DEFAULT_PATIENT_DATA;
  }
}

module.exports = {
  DEFAULT_PATIENT_DATA,
  getDefaultPatientData,
  validatePatientData,
  getPatientDataForClientType,
  formatForElevenLabs,
  getEnvironmentDefaults
};