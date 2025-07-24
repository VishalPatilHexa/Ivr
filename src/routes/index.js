const express = require("express");
const healthRoutes = require("./healthRoutes");
const outboundCallRoutes = require("./outboundCallRoutes");
const elevenLabsRoutes = require("./elevenLabsRoutes");

const router = express.Router();

// Mount all routes
router.use("/", healthRoutes);
router.use("/", outboundCallRoutes);
router.use("/", elevenLabsRoutes);

module.exports = router;
