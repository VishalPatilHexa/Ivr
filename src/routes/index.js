const express = require("express");
const healthRoutes = require("./healthRoutes");
const elevenLabsRoutes = require("./elevenLabsRoutes");
const elevenLabsWebhookRoutes = require("./elevenLabsWebhookRoutes");

const router = express.Router();

// Mount all routes
router.use("/", healthRoutes);
router.use("/", elevenLabsRoutes);
router.use("/", elevenLabsWebhookRoutes);

module.exports = router;
