const {
  initiateOutboundCall,
  getCallSession,
  getActiveCalls,
  getCallStats,
  handleCallStatusUpdate,
} = require("../knowlarity/outboundCallManager");

// Outbound Call Controller - handles Knowlarity outbound calls

const initiateCall = async (req, res) => {
  try {
    console.log("📥 Received request body:", JSON.stringify(req.body, null, 2));

    const { patientData } = req.body;

    console.log("📋 Patient data extracted:", patientData);

    // Validate required fields
    if (!patientData || !patientData.phoneNumber || !patientData.name) {
      console.log("❌ Validation failed:");
      console.log("- patientData exists:", !!patientData);
      console.log("- phoneNumber exists:", patientData?.phoneNumber);
      console.log("- name exists:", patientData?.name);

      return res.status(400).json({
        error: "Patient data with phoneNumber and name is required",
        received: req.body,
      });
    }

    // Initiate outbound call
    const result = await initiateOutboundCall(patientData);

    res.json({
      success: true,
      message: "Outbound call initiated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error initiating outbound call:", error);
    res.status(500).json({
      error: error.message,
      details: "Failed to initiate outbound call",
    });
  }
};

const getCallStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const callSession = getCallSession(sessionId);

    if (!callSession) {
      return res.status(404).json({ error: "Call session not found" });
    }

    res.json(callSession);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getActiveCallsController = async (req, res) => {
  try {
    const activeCalls = getActiveCalls();
    const stats = getCallStats();

    res.json({
      activeCalls,
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const { call_session_id, status, ...statusData } = req.body;

    if (!call_session_id) {
      return res.status(400).json({ error: "call_session_id is required" });
    }

    // Update call status
    handleCallStatusUpdate(call_session_id, {
      status,
      ...statusData,
    });

    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    console.error("Error handling call status update:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  initiateCall,
  getCallStatus,
  getActiveCalls: getActiveCallsController,
  handleWebhook
};