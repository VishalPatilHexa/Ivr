const { handleKnowlarityStream } = require('./streamHandler');
const { handleAcephone } = require('../../services/websocketHandler');

/**
 * Main WebSocket connection router
 */
function handleConnection(websocket, request) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const urlPath = url.pathname;

  console.log("🔍 WebSocket connection:", urlPath);

  // Route to Knowlarity stream handler
  if (urlPath.startsWith("/knowlarity-stream/")) {
    handleKnowlarityStream(websocket, urlPath);
    return;
  }

  // Route to Acephone stream handler
  if (urlPath.startsWith("/acephone")) {
    console.log("✅ Routing to acephone handler");
    handleAcephone(websocket, urlPath);
    return;
  }

  // Reject unknown connection types
  console.log(`❌ Unknown WebSocket path: ${urlPath}`);
  websocket.close(1008, "Unknown connection type");
}

module.exports = {
  handleConnection,
};