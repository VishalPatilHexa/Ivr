const express = require("express");
const healthRoutes = require("./health");
const streamRoutes = require("./stream");
const webhookRoutes = require("./webhook");
const outboundRoutes = require("./outbound");

const router = express.Router();

// Mount all v1 routes
router.use("/health", healthRoutes);
router.use("/stream", streamRoutes);
router.use("/webhook", webhookRoutes);
router.use("/outbound", outboundRoutes);

module.exports = router;
