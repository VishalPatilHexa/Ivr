const express = require("express");
const v1Routes = require("./v1");

const router = express.Router();

// Mount all API versions
router.use("/api/v1", v1Routes);

module.exports = router;
