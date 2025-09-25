/**
 * ===============================================================================
 * API USAGE EXAMPLES
 * ===============================================================================
 *
 * Examples demonstrating how to use the API clients throughout the application
 */

const { clients, createWebhookClient } = require("../src/api");
const apiService = require("../src/services/apiService");
const Logger = require("../src/utils/logger");

/**
 * Example 1: Initialize ElevenLabs Conversation
 */
async function exampleInitializeConversation() {
  try {
    // Using service layer (recommended for business logic)
    const result = await apiService.initializeConversation("agent_123", {
      sessionId: "session_456",
      patientQuery: "Hello, I need help with my appointment",
      metadata: {
        patientId: 789,
        source: "phone_call",
      },
    });

    Logger.info("Conversation initialized", result);
    return result;
  } catch (error) {
    Logger.error("Failed to initialize conversation", error);
    throw error;
  }
}

/**
 * Example 2: Make Outbound Call
 */
async function exampleMakeCall() {
  try {
    const callRequest = {
      to: "+1234567890",
      from: "+0987654321",
      agentNumber: "+1111111111",
      sessionId: "session_789",
      webhookUrl: "https://your-domain.com/api/v1/webhook/knowlarity",
    };

    const result = await apiService.makeCall(callRequest);
    Logger.info("Outbound call initiated", result);
    return result;
  } catch (error) {
    Logger.error("Failed to make call", error);
    throw error;
  }
}

/**
 * Example 3: Direct API Client Usage
 */
async function exampleDirectClientUsage() {
  try {
    // Get available voices
    const voices = await clients.elevenLabs.getVoices();
    Logger.info("Available voices", { count: voices.voices.length });

    // Get call logs from last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const callLogs = await clients.knowlarity.getCallLogs({
      startDate: weekAgo.toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      limit: 50,
    });

    Logger.info("Call logs retrieved", { count: callLogs.length });

    return { voices, callLogs };
  } catch (error) {
    Logger.error("Direct client usage failed", error);
    throw error;
  }
}

/**
 * Example 4: Text-to-Speech
 */
async function exampleTextToSpeech() {
  try {
    const text = "Hello, this is a test of the text-to-speech functionality.";
    const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel voice

    const result = await apiService.synthesizeSpeech(text, voiceId, {
      stability: 0.7,
      similarityBoost: 0.8,
      style: 0.2,
    });

    Logger.info("Speech synthesized", {
      size: result.audioBuffer.length,
      format: result.format,
    });

    return result;
  } catch (error) {
    Logger.error("Text-to-speech failed", error);
    throw error;
  }
}

/**
 * Example 5: Send SMS Notification
 */
async function exampleSendSMS() {
  try {
    const message =
      "Your appointment reminder: You have an appointment tomorrow at 3 PM.";

    const result = await apiService.sendSMS("+1234567890", message, {
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    Logger.info("SMS sent", result);
    return result;
  } catch (error) {
    Logger.error("SMS sending failed", error);
    throw error;
  }
}

/**
 * Example 6: Custom Webhook Client
 */
async function exampleWebhookClient() {
  try {
    // Create webhook client for external service
    const webhookClient = createWebhookClient(
      "https://external-service.com/api",
      {
        serviceName: "External Service",
        headers: {
          "X-Custom-Header": "custom-value",
        },
      }
    );

    // Send webhook notification
    const response = await webhookClient.post("/notifications", {
      event: "call_completed",
      sessionId: "session_123",
      duration: 180,
      timestamp: new Date().toISOString(),
    });

    Logger.info("Webhook sent successfully", response);
    return response;
  } catch (error) {
    Logger.error("Webhook failed", error);
    throw error;
  }
}

/**
 * Example 7: Health Check All Services
 */
async function exampleHealthCheck() {
  try {
    const healthStatus = await apiService.healthCheckAll();
    Logger.info("System health check", healthStatus);

    // Check if all services are healthy
    const allHealthy = healthStatus.status === "healthy";

    if (!allHealthy) {
      Logger.warn("Some services are unhealthy", {
        degradedServices: Object.entries(healthStatus.services)
          .filter(([, service]) => service.status !== "healthy")
          .map(([name]) => name),
      });
    }

    return healthStatus;
  } catch (error) {
    Logger.error("Health check failed", error);
    throw error;
  }
}

/**
 * Example 8: Error Handling Patterns
 */
async function exampleErrorHandling() {
  try {
    // This will likely fail to demonstrate error handling
    await clients.elevenLabs.getAgent("invalid_agent_id");
  } catch (error) {
    // Log the structured error information
    Logger.error("Expected error for demonstration", {
      name: error.name,
      operation: error.operation,
      status: error.status,
      requestId: error.requestId,
      message: error.message,
    });

    // Handle specific error types
    switch (error.operation) {
      case "FETCH_AGENT_FAILED":
        Logger.info("Agent not found, creating default agent...");
        break;
      default:
        Logger.error("Unhandled error type", error);
    }

    return { error: true, handled: true };
  }
}

/**
 * Run all examples (for testing purposes)
 */
async function runAllExamples() {
  Logger.info("Running API usage examples...");

  const examples = [
    { name: "Health Check", fn: exampleHealthCheck },
    { name: "Initialize Conversation", fn: exampleInitializeConversation },
    { name: "Direct Client Usage", fn: exampleDirectClientUsage },
    { name: "Text-to-Speech", fn: exampleTextToSpeech },
    { name: "Error Handling", fn: exampleErrorHandling },
  ];

  for (const example of examples) {
    try {
      Logger.info(`Running example: ${example.name}`);
      await example.fn();
      Logger.info(`✅ ${example.name} completed successfully`);
    } catch (error) {
      Logger.error(`❌ ${example.name} failed`, error);
    }
  }
}

module.exports = {
  exampleInitializeConversation,
  exampleMakeCall,
  exampleDirectClientUsage,
  exampleTextToSpeech,
  exampleSendSMS,
  exampleWebhookClient,
  exampleHealthCheck,
  exampleErrorHandling,
  runAllExamples,
};

// // Run examples if this file is executed directly
// if (require.main === module) {
//   runAllExamples()
//     .then(() => {
//       Logger.info("All examples completed");
//       process.exit(0);
//     })
//     .catch((error) => {
//       Logger.error("Examples failed", error);
//       process.exit(1);
//     });
// }
