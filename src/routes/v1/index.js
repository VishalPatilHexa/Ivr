const express = require("express");
const healthRoutes = require("./health");
const webhookRoutes = require("./webhook");
const outboundRoutes = require("./outbound");

const router = express.Router();

// Mount all v1 routes
router.use("/health", healthRoutes);
router.use("/webhook", webhookRoutes);
router.use("/outbound", outboundRoutes);

module.exports = router;
