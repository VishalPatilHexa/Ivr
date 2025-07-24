const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Environment variables
const knowlarityApiUrl = process.env.KNOWLARITY_API_URL || 'https://kpi.knowlarity.com';
const knowlarityApiKey = process.env.KNOWLARITY_API_KEY;
const knowlarityAuthToken = process.env.KNOWLARITY_AUTHORIZATION;
const knowlarityAccountId = process.env.KNOWLARITY_ACCOUNT_ID;
const knowlarityCallerId = process.env.KNOWLARITY_CALLER_ID;
const serverWebSocketUrl = process.env.SERVER_WEBSOCKET_URL || 'wss://stream.hexahealth.com/knowlarity-stream';
const testMode = process.env.KNOWLARITY_TEST_MODE === 'true';

// Store active calls and attempts
const activeCalls = new Map();
const callQueue = [];
const callAttempts = new Map();

// Initialize
console.log('✅ Outbound Call Manager initialized');
console.log('🔧 Test Mode:', testMode ? 'ENABLED' : 'DISABLED');
console.log('🔧 API URL:', knowlarityApiUrl);
console.log('🔧 Using makecall endpoint');

async function initiateOutboundCall(patientData) {
  try {
    // Validate required data
    if (!patientData.phoneNumber || !patientData.name) {
      throw new Error('Patient phone number and name are required');
    }

    // Generate unique call session ID
    const callSessionId = uuidv4();
    
    // Prepare call metadata for ElevenLabs
    const callMetadata = {
      patient_id: patientData.id || callSessionId,
      patient_name: patientData.name,
      patient_phone: patientData.phoneNumber,
      treatment_type: patientData.treatmentType || 'general consultation',
      call_type: 'outbound_data_collection',
      call_session_id: callSessionId,
      initiated_at: new Date().toISOString(),
      crm_data: patientData.crmData || {}
    };

    // Store call session
    activeCalls.set(callSessionId, {
      sessionId: callSessionId,
      patientData,
      callMetadata,
      status: 'initiating',
      attempts: (callAttempts.get(patientData.phoneNumber) || 0) + 1,
      createdAt: new Date()
    });

    // Prepare IVR flow configuration
    const ivrFlowConfig = createIVRFlowConfig(callSessionId, callMetadata);
    
    // Call Knowlarity API to initiate outbound call
    const callResult = await makeKnowlarityCall(patientData.phoneNumber, ivrFlowConfig);
    
    // Update call status
    const callSession = activeCalls.get(callSessionId);
    callSession.status = 'dialing';
    callSession.knowlarityCallId = callResult.success?.call_id || callResult.call_id;
    callSession.knowlarityResponse = callResult;

    console.log('📞 Outbound call initiated:', {
      sessionId: callSessionId,
      patient: patientData.name,
      phone: patientData.phoneNumber,
      knowlarityCallId: callResult.success?.call_id || callResult.call_id
    });

    return {
      success: true,
      sessionId: callSessionId,
      callId: callResult.success?.call_id || callResult.call_id,
      message: 'Outbound call initiated successfully',
      patientData,
      callMetadata,
      knowlarityResponse: callResult
    };

  } catch (error) {
    console.error('❌ Error initiating outbound call:', error);
    throw error;
  }
}

function createIVRFlowConfig(callSessionId, callMetadata) {
  // Create metadata in the format expected by Knowlarity streaming
  const streamMetadata = {
    ivr_data: JSON.stringify({
      client_data: "hexahealth_ivr",
      client_custom_id: callSessionId
    }),
    callid: callSessionId,
    virtual_number: knowlarityCallerId,
    customer_number: callMetadata.patient_phone,
    client_meta_id: callSessionId,
    event_timestamp: Date.now(),
    session_metadata: callMetadata
  };

  return {
    flow: {
      nodes: [
        {
          id: 'welcome',
          type: 'play',
          audio: {
            type: 'tts',
            text: 'कृपया एक क्षण प्रतीक्षा करें, हम आपको हमारे सहायक से जोड़ रहे हैं।',
            language: 'hi'
          },
          next: 'stream_node'
        },
        {
          id: 'stream_node',
          type: 'stream',
          config: {
            wss_url: `${serverWebSocketUrl}/${callSessionId}`,
            sampling_rate: '16k',
            metadata: JSON.stringify(streamMetadata)
          }
        }
      ]
    }
  };
}

async function makeKnowlarityCall(phoneNumber, ivrFlowConfig) {
  try {
    // Test mode - simulate API call without actually calling Knowlarity
    if (testMode) {
      console.log('🧪 TEST MODE: Simulating Knowlarity API call');
      console.log('📤 Would send to Knowlarity makecall endpoint:', JSON.stringify({
        k_number: knowlarityCallerId,
        customer_number: phoneNumber
      }, null, 2));
      
      return {
        success: true,
        call_id: 'test_call_' + Date.now(),
        status: 'initiated',
        message: 'Test call initiated successfully'
      };
    }

    // Use Click-to-Call API for direct customer connection
    console.log('🔄 Using Click-to-Call API...');
    return await makeClickToCall(phoneNumber);
  } catch (error) {
    console.error('❌ Knowlarity API call failed:');
    console.error('Status:', error.response?.status);
    console.error('Response:', error.response?.data);
    console.error('Headers:', error.response?.headers);
    console.error('Request URL:', error.config?.url);
    console.error('Request Data:', error.config?.data);
    
    throw new Error(`Knowlarity API error: ${error.response?.data?.message || error.message}`);
  }
}

async function makeClickToCall(phoneNumber) {
  const params = new URLSearchParams({
    phone_number: phoneNumber,
    agent_number: knowlarityCallerId,
    sr_number: knowlarityCallerId,
    caller_id: knowlarityCallerId,
    is_promotional: 'false'
  });

  const url = `https://sr.knowlarity.com/newsr/api/v1/click2call/?${params}`;
  
  console.log('📤 Click-to-Call URL:', url);
  console.log('🔑 Using SR API Key:', knowlarityApiKey ? knowlarityApiKey.substring(0, 10) + '...' : 'NOT SET');
  
  const response = await axios.get(url, {
    headers: {
      'x-api-key': knowlarityApiKey,
      'content-type': 'application/json'
    },
    timeout: 30000
  });

  console.log('✅ Click-to-Call Response:', response.data);
  return response.data;
}

function handleCallStatusUpdate(callSessionId, statusUpdate) {
  const callSession = activeCalls.get(callSessionId);
  if (!callSession) {
    console.warn('⚠️ Call session not found for status update:', callSessionId);
    return;
  }

  callSession.status = statusUpdate.status;
  callSession.lastUpdate = new Date();

  console.log('📊 Call status update:', {
    sessionId: callSessionId,
    status: statusUpdate.status,
    patient: callSession.patientData.name
  });

  // Handle different call statuses
  switch (statusUpdate.status) {
    case 'connected':
      handleCallConnected(callSessionId);
      break;
    case 'no_answer':
      handleCallNoAnswer(callSessionId);
      break;
    case 'busy':
      handleCallBusy(callSessionId);
      break;
    case 'failed':
      handleCallFailed(callSessionId, statusUpdate.reason);
      break;
    case 'completed':
      handleCallCompleted(callSessionId);
      break;
  }
}

function handleCallConnected(callSessionId) {
  const callSession = activeCalls.get(callSessionId);
  callSession.connectedAt = new Date();
  console.log('✅ Call connected:', callSessionId);
}

function handleCallNoAnswer(callSessionId) {
  const callSession = activeCalls.get(callSessionId);
  console.log('📵 Call no answer:', callSessionId);
  
  // Schedule retry if within limits
  const phoneNumber = callSession.patientData.phoneNumber;
  const attempts = callAttempts.get(phoneNumber) || 0;
  
  if (attempts < 3) {
    scheduleRetry(callSessionId, 'no_answer');
  } else {
    markCallFailed(callSessionId, 'max_attempts_reached');
  }
}

function handleCallBusy(callSessionId) {
  console.log('📞 Call busy:', callSessionId);
  scheduleRetry(callSessionId, 'busy');
}

function handleCallFailed(callSessionId, reason) {
  console.log('❌ Call failed:', callSessionId, reason);
  markCallFailed(callSessionId, reason);
}

function handleCallCompleted(callSessionId) {
  const callSession = activeCalls.get(callSessionId);
  callSession.completedAt = new Date();
  console.log('✅ Call completed:', callSessionId);
  
  // Clean up after some time
  setTimeout(() => {
    activeCalls.delete(callSessionId);
  }, 5 * 60 * 1000); // 5 minutes
}

function scheduleRetry(callSessionId, reason) {
  const callSession = activeCalls.get(callSessionId);
  const phoneNumber = callSession.patientData.phoneNumber;
  
  // Update attempt count
  callAttempts.set(phoneNumber, (callAttempts.get(phoneNumber) || 0) + 1);
  
  // Schedule retry after delay
  setTimeout(() => {
    console.log('🔄 Retrying call:', callSessionId, reason);
    initiateOutboundCall(callSession.patientData);
  }, 5 * 60 * 1000); // 5 minutes delay
}

function markCallFailed(callSessionId, reason) {
  const callSession = activeCalls.get(callSessionId);
  callSession.status = 'failed';
  callSession.failureReason = reason;
  callSession.failedAt = new Date();
  
  console.log('❌ Call marked as failed:', callSessionId, reason);
}

function getCallSession(callSessionId) {
  return activeCalls.get(callSessionId);
}

function getActiveCalls() {
  return Array.from(activeCalls.values());
}

function getCallStats() {
  const activeCallsArray = getActiveCalls();
  const stats = {
    total: activeCallsArray.length,
    initiating: activeCallsArray.filter(c => c.status === 'initiating').length,
    dialing: activeCallsArray.filter(c => c.status === 'dialing').length,
    connected: activeCallsArray.filter(c => c.status === 'connected').length,
    completed: activeCallsArray.filter(c => c.status === 'completed').length,
    failed: activeCallsArray.filter(c => c.status === 'failed').length
  };
  
  return stats;
}

module.exports = {
  initiateOutboundCall,
  handleCallStatusUpdate,
  getCallSession,
  getActiveCalls,
  getCallStats
};