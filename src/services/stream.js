const axios = require("axios");

// Environment variables
const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
const baseUrl = "https://api.elevenlabs.io/v1";
let agentPhoneNumberId = null;

async function makeOutboundCall(
  toNumber,
  agentPhoneNumberIdParam = null,
  conversationData = null
) {
  try {
    console.log("📞 Making ElevenLabs Twilio outbound call to:", toNumber);

    const phoneNumberId = agentPhoneNumberIdParam || agentPhoneNumberId;

    if (!phoneNumberId) {
      throw new Error(
        "Agent phone number ID not provided. Please configure your Twilio phone number in ElevenLabs dashboard and provide the phone number ID."
      );
    }

    const response = await axios.post(
      `${baseUrl}/convai/twilio/outbound-call`,
      {
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: toNumber,
        conversation_initiation_client_data: conversationData,
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ ElevenLabs call initiated:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error making ElevenLabs Twilio call:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to make ElevenLabs Twilio call: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

async function getPhoneNumbers() {
  try {
    const response = await axios.get(`${baseUrl}/convai/phone-numbers`, {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    console.log("📞 Available phone numbers:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error fetching phone numbers:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to fetch phone numbers: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

async function configurePhoneNumber(
  twilioPhoneNumber,
  twilioAccountSid,
  twilioAuthToken,
  label = "HexaHealth Phone"
) {
  try {
    console.log(
      "📞 Configuring phone number in ElevenLabs:",
      twilioPhoneNumber
    );

    const response = await axios.post(
      `${baseUrl}/convai/phone-numbers`,
      {
        provider: "twilio",
        phone_number: twilioPhoneNumber,
        label: label,
        sid: twilioAccountSid || process.env.TWILIO_ACCOUNT_SID,
        token: twilioAuthToken || process.env.TWILIO_AUTH_TOKEN,
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Phone number configured:", response.data);
    agentPhoneNumberId = response.data.phone_number_id;
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error configuring phone number:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to configure phone number: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

function setAgentPhoneNumberId(phoneNumberId) {
  agentPhoneNumberId = phoneNumberId;
  console.log("📞 Agent phone number ID set to:", phoneNumberId);
}

async function getConversationHistory(conversationId) {
  try {
    const response = await axios.get(
      `${baseUrl}/convai/conversations/${conversationId}`,
      {
        headers: {
          "xi-api-key": apiKey,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "❌ Error fetching conversation history:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to fetch conversation history: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

async function getAgentInfo() {
  try {
    const response = await axios.get(`${baseUrl}/convai/agents/${agentId}`, {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    console.log("🤖 Agent info:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error fetching agent info:",
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to fetch agent info: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

async function checkConversationalAIAccess() {
  try {
    const response = await axios.get(`${baseUrl}/convai/agents`, {
      headers: {
        "xi-api-key": apiKey,
      },
    });

    console.log("✅ Conversational AI access confirmed");
    return response.data;
  } catch (error) {
    console.error(
      "❌ Conversational AI access check failed:",
      error.response?.data || error.message
    );
    throw new Error(
      `Conversational AI not accessible: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

module.exports = {
  makeOutboundCall,
  getPhoneNumbers,
  configurePhoneNumber,
  setAgentPhoneNumberId,
  getConversationHistory,
  getAgentInfo,
  checkConversationalAIAccess,
};
