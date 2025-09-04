const { handleKnowlarityStream } = require('./streamHandler');

/**
 * Main WebSocket connection router
 */
function handleConnection(websocket, request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const urlPath = url.pathname;

  console.log(`🔌 WebSocket connection: ${urlPath}`);
  console.log(`📋 Request headers:`, JSON.stringify(request.headers, null, 2));
  console.log(`🌐 Full URL: ${request.url}`);
  console.log(`📍 Host: ${request.headers.host}`);

  // Route to Knowlarity stream handler
  if (urlPath.startsWith("/knowlarity-stream/")) {
    console.log(`✅ Routing to Knowlarity stream handler for: ${urlPath}`);
    handleKnowlarityStream(websocket, urlPath);
    return;
  }

  // Reject unknown connection types
  console.log(`❌ Unknown WebSocket path: ${urlPath}`);
  websocket.close(1008, "Unknown connection type");
}

module.exports = {
  handleConnection,
};