const express = require("express");
const healthController = require("../controllers/healthController");

const router = express.Router();

// Health Check API
router.get("/health", healthController.getHealth);

module.exports = router;
