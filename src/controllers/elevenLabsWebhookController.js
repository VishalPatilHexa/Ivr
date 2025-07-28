/**
 * ===============================================================================
 * ELEVENLABS WEBHOOK CONTROLLER
 * ===============================================================================
 * 
 * Handles post-call webhooks from ElevenLabs and manages session cleanup
 * Maps ElevenLabs conversation data with Knowlarity metadata
 */

const { activeConnections, cleanupSession } = require('../services/websocketHandler');

/**
 * Handle ElevenLabs post-call webhook
 */
async function handlePostCallWebhook(req, res) {
  try {
    const webhookData = req.body;
    
    console.log('🎯 ===== ELEVENLABS POST-CALL WEBHOOK RECEIVED =====');
    console.log('📊 Webhook data:', JSON.stringify(webhookData, null, 2));
    
    // Extract session information from webhook
    const conversationId = webhookData.conversation_id;
    const sessionId = webhookData.user_id || conversationId;
    
    console.log('🔍 Processing webhook for session:', sessionId);
    
    // Get Knowlarity metadata from stored connection
    const connection = activeConnections.get(sessionId);
    
    if (connection) {
      console.log('🔥 ===== MAPPING WEBHOOK WITH KNOWLARITY METADATA =====');
      
      // Get stored Knowlarity metadata
      const knowlarityMetadata = connection.knowlarityMetadata || {};
      
      console.log('📞 Knowlarity metadata:', JSON.stringify(knowlarityMetadata, null, 2));
      console.log('🤖 ElevenLabs webhook data:', JSON.stringify(webhookData, null, 2));
      
      // Prepare combined data for external API
      const combinedData = {
        sessionId: sessionId,
        conversationId: conversationId,
        knowlarity: {
          callid: knowlarityMetadata.callid,
          virtual_number: knowlarityMetadata.virtual_number,
          customer_number: knowlarityMetadata.customer_number,
          raw_metadata: knowlarityMetadata.raw
        },
        elevenlabs: {
          conversation_id: webhookData.conversation_id,
          conversation_duration_seconds: webhookData.conversation_duration_seconds,
          conversation_summary: webhookData.conversation_summary,
          agent_id: webhookData.agent_id,
          status: webhookData.status
        },
        timestamp: new Date().toISOString()
      };
      
      console.log('🔗 ===== COMBINED DATA FOR EXTERNAL API =====');
      console.log('📦 Combined data:', JSON.stringify(combinedData, null, 2));
      
      // TODO: Call external API with combined data
      await callExternalAPI(combinedData);
      
      // Perform cleanup after processing
      console.log('🧹 Performing session cleanup after webhook processing');
      const agentConversation = connection.agentConversation;
      cleanupSession(sessionId, agentConversation);
      
    } else {
      console.log('⚠️ No connection found for session:', sessionId);
      console.log('🔍 Available sessions:', Array.from(activeConnections.keys()));
    }
    
    console.log('🎯 ===== END ELEVENLABS WEBHOOK PROCESSING =====');
    
    // Respond to ElevenLabs webhook
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      sessionId: sessionId
    });
    
  } catch (error) {
    console.error('❌ Error processing ElevenLabs webhook:', error);
    console.error('💥 Error details:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      details: error.message
    });
  }
}

/**
 * Call external API with combined Knowlarity and ElevenLabs data
 */
async function callExternalAPI(combinedData) {
  try {
    console.log('📡 ===== CALLING EXTERNAL API =====');
    console.log('🚀 Data to send:', JSON.stringify(combinedData, null, 2));
    
    // TODO: Replace with actual external API endpoint
    const externalApiUrl = process.env.EXTERNAL_API_URL || 'https://your-api-endpoint.com/webhook';
    
    console.log(`📞 Would call external API: ${externalApiUrl}`);
    console.log('📦 Payload:', combinedData);
    
    // Uncomment below when ready to make actual API call
    /*
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXTERNAL_API_TOKEN}`
      },
      body: JSON.stringify(combinedData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ External API call successful:', result);
    } else {
      console.error('❌ External API call failed:', response.statusText);
    }
    */
    
    console.log('✅ External API call completed (currently mocked)');
    
  } catch (error) {
    console.error('❌ Error calling external API:', error);
    throw error;
  }
}

module.exports = {
  handlePostCallWebhook
};