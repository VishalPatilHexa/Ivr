/**
 * ===============================================================================
 * GOOGLE SHEETS SERVICE
 * ===============================================================================
 * 
 * Service for writing ElevenLabs webhook data to Google Sheets
 */

const { google } = require('googleapis');

/**
 * Initialize Google Sheets API client
 */
function getGoogleSheetsClient() {
  // Use service account credentials from environment variables or file
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS 
    ? JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS)
    : require('../../config/google-credentials.json'); // fallback to file
    
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  return google.sheets({ version: 'v4', auth });
}

/**
 * Write webhook data to Google Sheets as JSON
 */
async function writeToGoogleSheets(combinedData) {
  try {
    const sheets = getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    
    if (!spreadsheetId) {
      throw new Error('GOOGLE_SHEETS_ID environment variable not set');
    }
    
    console.log('📊 ===== WRITING TO GOOGLE SHEETS =====');
    
    // Current timestamp
    const timestamp = new Date().toISOString();
    
    // Prepare row data - just pass JSON as values
    const rowData = [
      timestamp, // A: Timestamp
      combinedData.sessionId || '', // B: Session ID
      combinedData.conversationId || '', // C: Conversation ID
      combinedData.recording_url || '', // D: Recording URL
      combinedData.transcript_summary || '', // E: Transcript Summary
      JSON.stringify(combinedData.all_dynamic_variables || {}), // F: All Dynamic Variables JSON
      JSON.stringify(combinedData.all_collected_data || {}), // G: All Collected Data JSON
      JSON.stringify(combinedData.elevenlabs_complete_data || {}), // H: Complete ElevenLabs Data JSON
      JSON.stringify(combinedData.knowlarity_raw_metadata || ''), // I: Knowlarity Data JSON
      JSON.stringify(combinedData) // J: Complete Combined Data JSON
    ];
    
    // Write to sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:J',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [rowData]
      }
    });
    
    console.log('✅ Successfully wrote data to Google Sheets');
    console.log('📍 Range updated:', response.data.updates.updatedRange);
    console.log('📊 Rows added:', response.data.updates.updatedRows);
    
    return response.data;
    
  } catch (error) {
    console.error('❌ Error writing to Google Sheets:', error.message);
    console.log('🔍 Data we tried to write:', JSON.stringify(combinedData, null, 2));
    throw error;
  }
}

/**
 * Create header row for Google Sheets (run this once)
 */
async function createHeaderRow() {
  try {
    const sheets = getGoogleSheetsClient();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    
    const headers = [
      'Timestamp',
      'Session ID',
      'Conversation ID',
      'Recording URL',
      'Transcript Summary',
      'Dynamic Variables (JSON)',
      'Collected Data (JSON)',
      'ElevenLabs Data (JSON)',
      'Knowlarity Data (JSON)',
      'Complete Data (JSON)'
    ];
    
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet1!A1:J1',
      valueInputOption: 'RAW',
      resource: {
        values: [headers]
      }
    });
    
    console.log('✅ Header row created successfully');
    return response.data;
    
  } catch (error) {
    console.error('❌ Error creating header row:', error.message);
    throw error;
  }
}

module.exports = {
  writeToGoogleSheets,
  createHeaderRow
};