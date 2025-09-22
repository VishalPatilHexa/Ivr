const express = require("express");
const streamController = require("../../controllers/stream");

const router = express.Router();

// Stream APIs
router.post("/call", streamController.makeCall);
router.get("/phone-numbers", streamController.getPhoneNumbers);
router.post("/configure-phone", streamController.configurePhone);
router.get("/agent-info", streamController.getAgentInfo);
router.get("/check-access", streamController.checkAccess);

module.exports = router;
