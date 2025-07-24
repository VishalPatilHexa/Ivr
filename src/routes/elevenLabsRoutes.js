const express = require("express");
const elevenLabsController = require("../controllers/elevenLabsController");

const router = express.Router();

// ElevenLabs Twilio APIs
router.post("/api/elevenlabs/call", elevenLabsController.makeCall);
router.get(
  "/api/elevenlabs/phone-numbers",
  elevenLabsController.getPhoneNumbers
);
router.post(
  "/api/elevenlabs/configure-phone",
  elevenLabsController.configurePhone
);
router.get("/api/elevenlabs/agent-info", elevenLabsController.getAgentInfo);
router.get("/api/elevenlabs/check-access", elevenLabsController.checkAccess);

module.exports = router;
