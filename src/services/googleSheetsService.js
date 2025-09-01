/**
 * ===============================================================================
 * GOOGLE SHEETS SERVICE
 * ===============================================================================
 * 
 * Service for writing ElevenLabs webhook data to Google Sheets
 */

const axios = require("axios");
require("dotenv").config(); 

async function addDataToSheet(googleSheetEntry) {
  try {
    const url = process.env.SHEET_URL; 
    const data = {
      function: "addRowToSheet",
      parameters: [googleSheetEntry],
    };

    const config = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    // Print curl command for testing
    console.log("📋 ===== CURL COMMAND FOR TESTING =====");
    console.log(`curl -X POST "${url}" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '${JSON.stringify(data, null, 0)}'`);
    console.log("📋 ===== END CURL COMMAND =====");

    console.log("🚀 Making request to Google Apps Script...");
    console.log("🔗 URL:", url);
    console.log("📦 Data:", JSON.stringify(data, null, 2));

    const response = await axios.post(url, data, config);
    console.log("✅ Response status:", response.status);
    console.log("📄 Response data:", response.data);
  } catch (error) {
    console.error("❌ Error in adding data to googleSheet:", error.message);
    if (error.response) {
      console.error("📊 Response status:", error.response.status);
      console.error("📄 Response data:", error.response.data);
    }
  }
}

module.exports = { addDataToSheet };