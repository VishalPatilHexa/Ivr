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
    
    // Extract session information from webhook
    const conversationId = webhookData.data?.conversation_id;
    const sessionId = webhookData.data?.conversation_initiation_client_data?.dynamic_variables?.user_id || conversationId;
    
    console.log('🔍 Processing webhook for session:', sessionId);
    
    // Extract key webhook data
    const webhookSummary = {
      conversation_id: conversationId,
      agent_id: webhookData.data?.agent_id,
      status: webhookData.data?.status,
      call_duration_secs: webhookData.data?.metadata?.call_duration_secs,
      cost: webhookData.data?.metadata?.cost,
      termination_reason: webhookData.data?.metadata?.termination_reason,
      transcript_summary: webhookData.data?.analysis?.transcript_summary,
      collected_data: {
        patientName: webhookData.data?.analysis?.data_collection_results?.patientName?.value,
        treatmentType: webhookData.data?.analysis?.data_collection_results?.treatmentType?.value,
        symptoms: webhookData.data?.analysis?.data_collection_results?.symptoms?.value,
        language: webhookData.data?.analysis?.data_collection_results?.language?.value
      }
    };
    
    console.log('📊 ===== ELEVENLABS WEBHOOK SUMMARY =====');
    console.log(JSON.stringify(webhookSummary, null, 2));
    
    // Get Knowlarity metadata from stored connection
    const connection = activeConnections.get(sessionId);
    
    if (connection) {
      const knowlarityMetadata = connection.knowlarityMetadata || {};
      
      console.log('📞 ===== KNOWLARITY METADATA =====');
      console.log('🔍 Raw metadata:', knowlarityMetadata.raw || 'No metadata stored');
      
      // Prepare combined data for external API
      const combinedData = {
        sessionId: sessionId,
        conversationId: conversationId,
        knowlarity_raw_metadata: knowlarityMetadata.raw,
        elevenlabs_summary: webhookSummary,
        timestamp: new Date().toISOString()
      };
      
      console.log('🔗 ===== COMBINED DATA FOR EXTERNAL API =====');
      console.log(JSON.stringify(combinedData, null, 2));
      
      // TODO: Call external API with combined data
      await callExternalAPI(combinedData);
      
      // Perform cleanup after processing
      console.log('🧹 Performing session cleanup after webhook processing');
      const agentConversation = connection.agentConversation;
      cleanupSession(sessionId, agentConversation);
      
    } else {
      console.log('⚠️ No connection found for session:', sessionId);
      console.log('💡 This is normal - cleanup may have already happened');
      
      // Still log the important webhook data even without Knowlarity metadata
      console.log('📊 ===== ELEVENLABS DATA ONLY =====');
      console.log(JSON.stringify(webhookSummary, null, 2));
      
      // TODO: Call external API with ElevenLabs data only
      await callExternalAPI({
        sessionId: sessionId,
        conversationId: conversationId,
        knowlarity_raw_metadata: null,
        elevenlabs_summary: webhookSummary,
        timestamp: new Date().toISOString()
      });
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