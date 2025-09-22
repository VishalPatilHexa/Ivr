const {
  makeOutboundCall,
  getPhoneNumbers,
  configurePhoneNumber,
  getAgentInfo,
  checkConversationalAIAccess,
} = require("../services/stream");

// ElevenLabs Controller - handles ElevenLabs Twilio integration

const makeCall = async (req, res) => {
  try {
    const { to, agentPhoneNumberId, conversationData } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const result = await makeOutboundCall(
      to,
      agentPhoneNumberId,
      conversationData
    );

    res.json({
      success: true,
      ...result,
      message: "ElevenLabs call initiated successfully",
    });
  } catch (error) {
    console.error("Error making ElevenLabs call:", error);
    res.status(500).json({ error: error.message });
  }
};

const getPhoneNumbersController = async (req, res) => {
  try {
    const phoneNumbers = await getPhoneNumbers();
    res.json(phoneNumbers);
  } catch (error) {
    console.error("Error fetching phone numbers:", error);
    res.status(500).json({ error: error.message });
  }
};

const configurePhone = async (req, res) => {
  try {
    const { phoneNumber, twilioAccountSid, twilioAuthToken, label } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const result = await configurePhoneNumber(
      phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      label
    );

    res.json({
      success: true,
      ...result,
      message: "Phone number configured successfully",
    });
  } catch (error) {
    console.error("Error configuring phone number:", error);
    res.status(500).json({ error: error.message });
  }
};

const getAgentInfoController = async (req, res) => {
  try {
    const agentInfo = await getAgentInfo();
    res.json(agentInfo);
  } catch (error) {
    console.error("Error fetching agent info:", error);
    res.status(500).json({ error: error.message });
  }
};

const checkAccess = async (req, res) => {
  try {
    const accessInfo = await checkConversationalAIAccess();
    res.json({
      success: true,
      message: "Conversational AI access confirmed",
      data: accessInfo,
    });
  } catch (error) {
    console.error("Error checking conversational AI access:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  makeCall,
  getPhoneNumbers: getPhoneNumbersController,
  configurePhone,
  getAgentInfo: getAgentInfoController,
  checkAccess,
};
