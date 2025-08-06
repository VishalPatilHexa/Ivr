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

    const response = await axios.post(url, data, config);
    console.log(response.data);
  } catch (error) {
    console.error("Error in adding data to googleSheet:", error);
  }
}

module.exports = { addDataToSheet };