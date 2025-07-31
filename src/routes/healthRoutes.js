const express = require("express");
const path = require("path");
const healthController = require("../controllers/healthController");

const router = express.Router();

// Health Check API
router.get("/health", healthController.getHealth);

// PreOpAssistBot page route
router.get("/PreOpAssistBot", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/PreOpAssistBot.html"));
});

module.exports = router;
