const express = require("express");
const path = require("path");
const healthController = require("../../controllers/health");

const router = express.Router();

// Health Check API
router.get("/", healthController.getHealth);

// PreOpAssistBot page route
router.get("/preop-assist", (req, res) => {
  res.sendFile(path.join(__dirname, "../../../public/PreOpAssistBot.html"));
});

module.exports = router;
