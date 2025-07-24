const express = require("express");
const outboundCallController = require("../controllers/outboundCallController");

const router = express.Router();

// Knowlarity Outbound Call APIs
router.post("/api/outbound-call", outboundCallController.initiateCall);
router.get(
  "/api/outbound-call/:sessionId",
  outboundCallController.getCallStatus
);
router.get("/api/outbound-calls", outboundCallController.getActiveCalls);
router.post("/api/knowlarity/webhook", outboundCallController.handleWebhook);

module.exports = router;
