class ElevenLabsController {
  constructor(elevenLabsTwilioService) {
    this.elevenLabsTwilioService = elevenLabsTwilioService;
  }

  async makeCall(req, res) {
    try {
      const { to, agentPhoneNumberId, conversationData } = req.body;
      
      if (!to) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      const result = await this.elevenLabsTwilioService.makeOutboundCall(to, agentPhoneNumberId, conversationData);
      
      res.json({
        success: true,
        ...result,
        message: "ElevenLabs call initiated successfully"
      });
    } catch (error) {
      console.error('Error making ElevenLabs call:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getPhoneNumbers(req, res) {
    try {
      const phoneNumbers = await this.elevenLabsTwilioService.getPhoneNumbers();
      res.json(phoneNumbers);
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async configurePhone(req, res) {
    try {
      const { phoneNumber, twilioAccountSid, twilioAuthToken, label } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required" });
      }
      
      const result = await this.elevenLabsTwilioService.configurePhoneNumber(
        phoneNumber, 
        twilioAccountSid, 
        twilioAuthToken,
        label
      );
      
      res.json({
        success: true,
        ...result,
        message: "Phone number configured successfully"
      });
    } catch (error) {
      console.error('Error configuring phone number:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getAgentInfo(req, res) {
    try {
      const agentInfo = await this.elevenLabsTwilioService.getAgentInfo();
      res.json(agentInfo);
    } catch (error) {
      console.error('Error fetching agent info:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async checkAccess(req, res) {
    try {
      const accessInfo = await this.elevenLabsTwilioService.checkConversationalAIAccess();
      res.json({
        success: true,
        message: "Conversational AI access confirmed",
        data: accessInfo
      });
    } catch (error) {
      console.error('Error checking conversational AI access:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = ElevenLabsController;