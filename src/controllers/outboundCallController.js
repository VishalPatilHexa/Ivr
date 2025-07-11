class OutboundCallController {
  constructor(outboundCallManager) {
    this.outboundCallManager = outboundCallManager;
  }

  async initiateCall(req, res) {
    try {
      console.log('📥 Received request body:', JSON.stringify(req.body, null, 2));
      
      const { patientData } = req.body;
      
      console.log('📋 Patient data extracted:', patientData);
      
      // Validate required fields
      if (!patientData || !patientData.phoneNumber || !patientData.name) {
        console.log('❌ Validation failed:');
        console.log('- patientData exists:', !!patientData);
        console.log('- phoneNumber exists:', patientData?.phoneNumber);
        console.log('- name exists:', patientData?.name);
        
        return res.status(400).json({ 
          error: "Patient data with phoneNumber and name is required",
          received: req.body
        });
      }
      
      // Initiate outbound call
      const result = await this.outboundCallManager.initiateOutboundCall(patientData);
      
      res.json({
        success: true,
        message: "Outbound call initiated successfully",
        data: result
      });
      
    } catch (error) {
      console.error("Error initiating outbound call:", error);
      res.status(500).json({ 
        error: error.message,
        details: "Failed to initiate outbound call"
      });
    }
  }

  async getCallStatus(req, res) {
    try {
      const { sessionId } = req.params;
      const callSession = this.outboundCallManager.getCallSession(sessionId);
      
      if (!callSession) {
        return res.status(404).json({ error: "Call session not found" });
      }
      
      res.json(callSession);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getActiveCalls(req, res) {
    try {
      const activeCalls = this.outboundCallManager.getActiveCalls();
      const stats = this.outboundCallManager.getCallStats();
      
      res.json({
        activeCalls,
        stats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleWebhook(req, res) {
    try {
      const { call_session_id, status, ...statusData } = req.body;
      
      if (!call_session_id) {
        return res.status(400).json({ error: "call_session_id is required" });
      }
      
      // Update call status
      this.outboundCallManager.handleCallStatusUpdate(call_session_id, {
        status,
        ...statusData
      });
      
      res.json({ success: true, message: "Status updated" });
    } catch (error) {
      console.error("Error handling call status update:", error);
      res.status(500).json({ error: error.message });
    }
  }

  async handleCallback(req, res) {
    try {
      console.log('📞 Knowlarity callback received:', JSON.stringify(req.body, null, 2));
      
      const { call_id, status, caller_id, customer_number, ...callData } = req.body;
      
      // Find the call session by phone number or call_id
      const activeCalls = this.outboundCallManager.getActiveCalls();
      const callSession = activeCalls.find(call => 
        call.patientData.phoneNumber === customer_number || 
        call.knowlarityCallId === call_id
      );
      
      if (callSession) {
        this.outboundCallManager.handleCallStatusUpdate(callSession.sessionId, {
          status,
          knowlarityCallId: call_id,
          ...callData
        });
      }
      
      res.json({ success: true, message: "Callback processed" });
    } catch (error) {
      console.error("Error handling Knowlarity callback:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = OutboundCallController;