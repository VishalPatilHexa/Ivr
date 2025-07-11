const axios = require("axios");

class ElevenLabsTwilioService {
  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    this.agentId = process.env.ELEVENLABS_AGENT_ID;
    this.baseUrl = "https://api.elevenlabs.io/v1";
    this.agentPhoneNumberId = null; // Will be set when phone number is configured
  }

  async makeOutboundCall(toNumber, conversationData = null) {
    try {
      console.log('📞 Making ElevenLabs Twilio outbound call to:', toNumber);
      
      if (!this.agentPhoneNumberId) {
        throw new Error('Agent phone number ID not configured. Please configure your Twilio phone number in ElevenLabs dashboard.');
      }

      const response = await axios.post(
        `${this.baseUrl}/convai/twilio/outbound-call`,
        {
          agent_id: this.agentId,
          agent_phone_number_id: this.agentPhoneNumberId,
          to_number: toNumber,
          conversation_initiation_client_data: conversationData
        },
        {
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json"
          }
        }
      );

      console.log('✅ ElevenLabs call initiated:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error making ElevenLabs Twilio call:', error.response?.data || error.message);
      throw new Error(`Failed to make ElevenLabs Twilio call: ${error.response?.data?.message || error.message}`);
    }
  }

  async getPhoneNumbers() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/convai/phone-numbers`,
        {
          headers: {
            "xi-api-key": this.apiKey
          }
        }
      );

      console.log('📞 Available phone numbers:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching phone numbers:', error.response?.data || error.message);
      throw new Error(`Failed to fetch phone numbers: ${error.response?.data?.message || error.message}`);
    }
  }

  async configurePhoneNumber(twilioPhoneNumber) {
    try {
      console.log('📞 Configuring phone number in ElevenLabs:', twilioPhoneNumber);
      
      const response = await axios.post(
        `${this.baseUrl}/convai/phone-numbers`,
        {
          phone_number: twilioPhoneNumber,
          agent_id: this.agentId
        },
        {
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json"
          }
        }
      );

      console.log('✅ Phone number configured:', response.data);
      this.agentPhoneNumberId = response.data.phone_number_id;
      return response.data;
    } catch (error) {
      console.error('❌ Error configuring phone number:', error.response?.data || error.message);
      throw new Error(`Failed to configure phone number: ${error.response?.data?.message || error.message}`);
    }
  }

  setAgentPhoneNumberId(phoneNumberId) {
    this.agentPhoneNumberId = phoneNumberId;
    console.log('📞 Agent phone number ID set to:', phoneNumberId);
  }

  async getConversationHistory(conversationId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/convai/conversations/${conversationId}`,
        {
          headers: {
            "xi-api-key": this.apiKey
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Error fetching conversation history:', error.response?.data || error.message);
      throw new Error(`Failed to fetch conversation history: ${error.response?.data?.message || error.message}`);
    }
  }

  async getAgentInfo() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/convai/agents/${this.agentId}`,
        {
          headers: {
            "xi-api-key": this.apiKey
          }
        }
      );

      console.log('🤖 Agent info:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching agent info:', error.response?.data || error.message);
      throw new Error(`Failed to fetch agent info: ${error.response?.data?.message || error.message}`);
    }
  }

  async checkConversationalAIAccess() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/convai/agents`,
        {
          headers: {
            "xi-api-key": this.apiKey
          }
        }
      );

      console.log('✅ Conversational AI access confirmed');
      return response.data;
    } catch (error) {
      console.error('❌ Conversational AI access check failed:', error.response?.data || error.message);
      throw new Error(`Conversational AI not accessible: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = { ElevenLabsTwilioService };