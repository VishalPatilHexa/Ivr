const express = require("express");
const healthRoutes = require("./healthRoutes");
const outboundCallRoutes = require("./outboundCallRoutes");
const elevenLabsRoutes = require("./elevenLabsRoutes");
const elevenLabsWebhookRoutes = require("./elevenLabsWebhookRoutes");

const router = express.Router();

// Mount all routes
router.use("/", healthRoutes);
router.use("/", outboundCallRoutes);
router.use("/", elevenLabsRoutes);
router.use("/", elevenLabsWebhookRoutes);

module.exports = router;
