// Health Controller - handles system health checks

const getHealth = (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "HexaHealth IVR",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
};

module.exports = {
  getHealth
};