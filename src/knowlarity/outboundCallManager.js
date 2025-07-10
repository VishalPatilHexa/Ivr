const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class OutboundCallManager {
  constructor() {
    this.knowlarityApiUrl = process.env.KNOWLARITY_API_URL || 'https://kpi.knowlarity.com';
    this.knowlarityApiKey = process.env.KNOWLARITY_API_KEY; // X-API-KEY
    this.knowlarityAuthToken = process.env.KNOWLARITY_AUTHORIZATION; // Authorization token
    this.knowlarityAccountId = process.env.KNOWLARITY_ACCOUNT_ID;
    this.knowlarityCallerId = process.env.KNOWLARITY_CALLER_ID;
    this.serverWebSocketUrl = process.env.SERVER_WEBSOCKET_URL || 'wss://your-server.com/knowlarity-stream';
    this.testMode = process.env.KNOWLARITY_TEST_MODE === 'true';
    
    this.activeCalls = new Map();
    this.callQueue = [];
    this.callAttempts = new Map();
    
    console.log('✅ Outbound Call Manager initialized');
    console.log('🔧 Test Mode:', this.testMode ? 'ENABLED' : 'DISABLED');
    console.log('🔧 API URL:', this.knowlarityApiUrl);
    console.log('🔧 Using makecall endpoint');
  }

  /**
   * Trigger outbound call from API
   * @param {Object} patientData - Patient information from CRM
   * @returns {Promise<Object>} Call initiation result
   */
  async initiateOutboundCall(patientData) {
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
      this.activeCalls.set(callSessionId, {
        sessionId: callSessionId,
        patientData,
        callMetadata,
        status: 'initiating',
        attempts: (this.callAttempts.get(patientData.phoneNumber) || 0) + 1,
        createdAt: new Date()
      });

      // Prepare IVR flow configuration
      const ivrFlowConfig = this.createIVRFlowConfig(callSessionId, callMetadata);
      
      // Call Knowlarity API to initiate outbound call
      const callResult = await this.makeKnowlarityCall(patientData.phoneNumber, ivrFlowConfig);
      
      // Update call status
      const callSession = this.activeCalls.get(callSessionId);
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

  /**
   * Create IVR flow configuration for the call
   * @param {string} callSessionId - Unique call session ID
   * @param {Object} callMetadata - Call metadata for ElevenLabs
   * @returns {Object} IVR flow configuration
   */
  createIVRFlowConfig(callSessionId, callMetadata) {
    // Create metadata in the format expected by Knowlarity streaming
    const streamMetadata = {
      ivr_data: JSON.stringify({
        client_data: "hexahealth_ivr",
        client_custom_id: callSessionId
      }),
      callid: callSessionId,
      virtual_number: this.knowlarityCallerId,
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
              wss_url: `${this.serverWebSocketUrl}/${callSessionId}`,
              sampling_rate: '16k',
              metadata: JSON.stringify(streamMetadata)
            }
          }
        ]
      }
    };
  }

  /**
   * Make actual API call to Knowlarity
   * @param {string} phoneNumber - Customer phone number
   * @param {Object} ivrFlowConfig - IVR flow configuration
   * @returns {Promise<Object>} Knowlarity API response
   */
  async makeKnowlarityCall(phoneNumber, ivrFlowConfig) {
    try {
      // Test mode - simulate API call without actually calling Knowlarity
      if (this.testMode) {
        console.log('🧪 TEST MODE: Simulating Knowlarity API call');
        console.log('📤 Would send to Knowlarity makecall endpoint:', JSON.stringify({
          k_number: this.knowlarityCallerId,
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
      return await this.makeClickToCall(phoneNumber);
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

  async makeIVRCampaignCall(phoneNumber, ivrFlowConfig) {
    // Create IVR campaign with Stream Node for direct customer connection
    const now = new Date();
    const startTime = new Date(now.getTime() + 30 * 1000); // Start in 30 seconds
    const formattedStartTime = startTime.toISOString().slice(0, 16).replace('T', ' ');

    // Create IVR flow with Stream Node only
    const streamIVRFlow = {
      flow: {
        nodes: [
          {
            id: "stream_start",
            type: "stream",
            config: {
              wss_url: ivrFlowConfig.flow.nodes[1].config.wss_url, // Use the WebSocket URL from original flow
              sampling_rate: "16k",
              metadata: ivrFlowConfig.flow.nodes[1].config.metadata // Use the metadata from original flow
            }
          }
        ]
      }
    };

    const callData = {
      k_number: this.knowlarityCallerId,
      additional_number: phoneNumber,
      caller_id: this.knowlarityCallerId,
      start_time: formattedStartTime,
      timezone: "Asia/Kolkata",
      priority: 1,
      order_throttling: 1,
      retry_duration: 0,
      max_retry: 0,
      call_scheduling: "[1, 1, 1, 1, 1, 1, 1]", // All days
      call_scheduling_start_time: "00:00",
      call_scheduling_stop_time: "23:59",
      is_promotional: false,
      sound_id: 1, // Default sound ID - you may need to create this in Knowlarity dashboard
      ivr_flow: streamIVRFlow // Direct stream IVR flow
    };

    console.log('📤 IVR Campaign with Stream Node Request:', JSON.stringify(callData, null, 2));
    console.log('🔑 Using X-API-Key:', this.knowlarityApiKey ? this.knowlarityApiKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('🔑 Using Authorization:', this.knowlarityAuthToken ? this.knowlarityAuthToken.substring(0, 10) + '...' : 'NOT SET');
    
    const fullUrl = `${this.knowlarityApiUrl}/Basic/v1/account/call/campaign`;
    console.log(`📤 Full URL: ${fullUrl}`);
    
    const response = await axios.post(
      fullUrl,
      callData,
      {
        headers: {
          'authorization': this.knowlarityAuthToken,
          'x-api-key': this.knowlarityApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ IVR Campaign Response:', response.data);
    return response.data;
  }

  async makeMakeCallDirect(phoneNumber, ivrFlowConfig) {
    // Use makecall API with same number as agent and customer - this will create a direct call
    const callData = {
      k_number: this.knowlarityCallerId,
      agent_number: phoneNumber,  // Use customer number as agent number
      customer_number: phoneNumber // Same as customer number
    };

    console.log('📤 Direct MakeCall API Request:', JSON.stringify(callData, null, 2));
    console.log('🔑 Using X-API-Key:', this.knowlarityApiKey ? this.knowlarityApiKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('🔑 Using Authorization:', this.knowlarityAuthToken ? this.knowlarityAuthToken.substring(0, 10) + '...' : 'NOT SET');
    
    const fullUrl = `${this.knowlarityApiUrl}/Basic/v1/account/call/makecall`;
    console.log(`📤 Full URL: ${fullUrl}`);
    
    const response = await axios.post(
      fullUrl,
      callData,
      {
        headers: {
          'authorization': this.knowlarityAuthToken,
          'x-api-key': this.knowlarityApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Direct MakeCall API Response:', response.data);
    return response.data;
  }

  async makeDirectCustomerCall(phoneNumber, ivrFlowConfig) {
    // Use campaign API for direct customer calling with IVR
    const now = new Date();
    const startTime = new Date(now.getTime() + 30 * 1000); // Start in 30 seconds
    const formattedStartTime = startTime.toISOString().slice(0, 16).replace('T', ' ');

    const callData = {
      k_number: this.knowlarityCallerId,
      additional_number: phoneNumber,
      caller_id: this.knowlarityCallerId,
      start_time: formattedStartTime,
      timezone: "Asia/Kolkata",
      priority: 1,
      order_throttling: 1,
      retry_duration: 0,
      max_retry: 0,
      call_scheduling: "[1, 1, 1, 1, 1, 1, 1]", // All days
      call_scheduling_start_time: "00:00",
      call_scheduling_stop_time: "23:59",
      is_promotional: false,
      ivr_flow: ivrFlowConfig // Direct IVR flow
    };

    console.log('📤 Direct Customer Call Request:', JSON.stringify(callData, null, 2));
    console.log('🔑 Using X-API-Key:', this.knowlarityApiKey ? this.knowlarityApiKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('🔑 Using Authorization:', this.knowlarityAuthToken ? this.knowlarityAuthToken.substring(0, 10) + '...' : 'NOT SET');
    
    const fullUrl = `${this.knowlarityApiUrl}/Basic/v1/account/call/campaign`;
    console.log(`📤 Full URL: ${fullUrl}`);
    
    const response = await axios.post(
      fullUrl,
      callData,
      {
        headers: {
          'authorization': this.knowlarityAuthToken,
          'x-api-key': this.knowlarityApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Direct Customer Call Response:', response.data);
    return response.data;
  }

  async makeMakeCall(phoneNumber, ivrFlowConfig, endpoint = 'Basic/v1/account/call/makecall') {
    // Fallback method - kept for reference but not used for direct calls
    const callData = {
      k_number: this.knowlarityCallerId,
      customer_number: phoneNumber,
      caller_id: this.knowlarityCallerId,
      ivr_flow: ivrFlowConfig,
      direct_connect: true
    };

    console.log('📤 MakeCall API Request (Fallback):', JSON.stringify(callData, null, 2));
    
    const fullUrl = `${this.knowlarityApiUrl}/${endpoint}`;
    console.log(`📤 Full URL: ${fullUrl}`);
    
    const response = await axios.post(
      fullUrl,
      callData,
      {
        headers: {
          'channel': 'Basic',
          'authorization': this.knowlarityAuthToken,
          'x-api-key': this.knowlarityApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ MakeCall API Response:', response.data);
    return response.data;
  }

  async makeClickToCall(phoneNumber) {
    const params = new URLSearchParams({
      phone_number: phoneNumber,
      agent_number: this.knowlarityCallerId,
      sr_number: this.knowlarityCallerId,
      caller_id: this.knowlarityCallerId,
      is_promotional: 'false'
    });

    const url = `https://sr.knowlarity.com/newsr/api/v1/click2call/?${params}`;
    
    console.log('📤 Click-to-Call URL:', url);
    console.log('🔑 Using SR API Key:', this.knowlarityApiKey ? this.knowlarityApiKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('🔑 Using App Key:', this.knowlarityAppKey ? this.knowlarityAppKey.substring(0, 10) + '...' : 'NOT SET');
    
    const response = await axios.get(url, {
      headers: {
        'x-api-key': this.knowlarityApiKey,
        'content-type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ Click-to-Call Response:', response.data);
    return response.data;
  }

  async makeCampaignCall(phoneNumber, ivrFlowConfig) {
    const now = new Date();
    const startTime = new Date(now.getTime() + 2 * 60 * 1000); // Start in 2 minutes
    const formattedStartTime = startTime.toISOString().slice(0, 16).replace('T', ' ');

    const callData = {
      sound_id: 1, // You may need to create a sound/IVR in Knowlarity dashboard
      timezone: "Asia/Kolkata",
      priority: 1,
      order_throttling: 10,
      retry_duration: 15,
      max_retry: 1,
      start_time: formattedStartTime,
      call_scheduling: "[1, 1, 1, 1, 1, 0, 0]", // Monday to Friday
      call_scheduling_start_time: "09:00",
      call_scheduling_stop_time: "21:00",
      k_number: this.knowlarityCallerId,
      additional_number: phoneNumber,
      is_promotional: false
    };

    console.log('📤 Campaign API Request:', JSON.stringify(callData, null, 2));
    console.log('🔑 Using SR API Key:', this.knowlarityApiKey ? this.knowlarityApiKey.substring(0, 10) + '...' : 'NOT SET');
    console.log('🔑 Using App Key:', this.knowlarityAppKey ? this.knowlarityAppKey.substring(0, 10) + '...' : 'NOT SET');
    
    const response = await axios.post(
      `${this.knowlarityApiUrl}/Basic/v1/account/call/campaign`,
      callData,
      {
        headers: {
          'x-api-key': this.knowlarityApiKey,
          'content-type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Campaign API Response:', response.data);
    return response.data;
  }

  /**
   * Handle call status updates from Knowlarity
   * @param {string} callSessionId - Call session ID
   * @param {Object} statusUpdate - Status update from Knowlarity
   */
  handleCallStatusUpdate(callSessionId, statusUpdate) {
    const callSession = this.activeCalls.get(callSessionId);
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
        this.handleCallConnected(callSessionId);
        break;
      case 'no_answer':
        this.handleCallNoAnswer(callSessionId);
        break;
      case 'busy':
        this.handleCallBusy(callSessionId);
        break;
      case 'failed':
        this.handleCallFailed(callSessionId, statusUpdate.reason);
        break;
      case 'completed':
        this.handleCallCompleted(callSessionId);
        break;
    }
  }

  /**
   * Handle successful call connection
   * @param {string} callSessionId - Call session ID
   */
  handleCallConnected(callSessionId) {
    const callSession = this.activeCalls.get(callSessionId);
    callSession.connectedAt = new Date();
    console.log('✅ Call connected:', callSessionId);
  }

  /**
   * Handle call no answer
   * @param {string} callSessionId - Call session ID
   */
  handleCallNoAnswer(callSessionId) {
    const callSession = this.activeCalls.get(callSessionId);
    console.log('📵 Call no answer:', callSessionId);
    
    // Schedule retry if within limits
    const phoneNumber = callSession.patientData.phoneNumber;
    const attempts = this.callAttempts.get(phoneNumber) || 0;
    
    if (attempts < 3) {
      this.scheduleRetry(callSessionId, 'no_answer');
    } else {
      this.markCallFailed(callSessionId, 'max_attempts_reached');
    }
  }

  /**
   * Handle call busy
   * @param {string} callSessionId - Call session ID
   */
  handleCallBusy(callSessionId) {
    console.log('📞 Call busy:', callSessionId);
    this.scheduleRetry(callSessionId, 'busy');
  }

  /**
   * Handle call failure
   * @param {string} callSessionId - Call session ID
   * @param {string} reason - Failure reason
   */
  handleCallFailed(callSessionId, reason) {
    console.log('❌ Call failed:', callSessionId, reason);
    this.markCallFailed(callSessionId, reason);
  }

  /**
   * Handle call completion
   * @param {string} callSessionId - Call session ID
   */
  handleCallCompleted(callSessionId) {
    const callSession = this.activeCalls.get(callSessionId);
    callSession.completedAt = new Date();
    console.log('✅ Call completed:', callSessionId);
    
    // Clean up after some time
    setTimeout(() => {
      this.activeCalls.delete(callSessionId);
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Schedule call retry
   * @param {string} callSessionId - Call session ID
   * @param {string} reason - Retry reason
   */
  scheduleRetry(callSessionId, reason) {
    const callSession = this.activeCalls.get(callSessionId);
    const phoneNumber = callSession.patientData.phoneNumber;
    
    // Update attempt count
    this.callAttempts.set(phoneNumber, (this.callAttempts.get(phoneNumber) || 0) + 1);
    
    // Schedule retry after delay
    setTimeout(() => {
      console.log('🔄 Retrying call:', callSessionId, reason);
      this.initiateOutboundCall(callSession.patientData);
    }, 5 * 60 * 1000); // 5 minutes delay
  }

  /**
   * Mark call as failed
   * @param {string} callSessionId - Call session ID
   * @param {string} reason - Failure reason
   */
  markCallFailed(callSessionId, reason) {
    const callSession = this.activeCalls.get(callSessionId);
    callSession.status = 'failed';
    callSession.failureReason = reason;
    callSession.failedAt = new Date();
    
    console.log('❌ Call marked as failed:', callSessionId, reason);
  }

  /**
   * Get call session information
   * @param {string} callSessionId - Call session ID
   * @returns {Object} Call session data
   */
  getCallSession(callSessionId) {
    return this.activeCalls.get(callSessionId);
  }

  /**
   * Get all active calls
   * @returns {Array} Array of active call sessions
   */
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get call statistics
   * @returns {Object} Call statistics
   */
  getCallStats() {
    const activeCalls = this.getActiveCalls();
    const stats = {
      total: activeCalls.length,
      initiating: activeCalls.filter(c => c.status === 'initiating').length,
      dialing: activeCalls.filter(c => c.status === 'dialing').length,
      connected: activeCalls.filter(c => c.status === 'connected').length,
      completed: activeCalls.filter(c => c.status === 'completed').length,
      failed: activeCalls.filter(c => c.status === 'failed').length
    };
    
    return stats;
  }
}

module.exports = { OutboundCallManager };