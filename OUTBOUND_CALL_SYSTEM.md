# Outbound Call System - HexaHealth IVR

## Overview
Complete outbound call management system integrating Knowlarity IVR platform with ElevenLabs conversational AI for automated data collection calls.

## System Architecture

```
CRM System → API Call → OutboundCallManager → Knowlarity → WebSocket → ElevenLabs Agent
```

## Key Components

### 1. OutboundCallManager (`src/knowlarity/outboundCallManager.js`)
- Manages outbound call lifecycle
- Handles Knowlarity API integration
- Tracks call sessions and retry logic
- Manages call metadata and patient data

### 2. API Endpoints (`server.js`)
- `POST /api/outbound-call` - Trigger outbound calls
- `GET /api/outbound-call/:sessionId` - Get call status
- `GET /api/outbound-calls` - Get all active calls
- `POST /api/knowlarity/webhook` - Handle status updates

### 3. WebSocket Server
- Handles real-time call streams from Knowlarity
- Bridges audio between Knowlarity and ElevenLabs
- Manages call state transitions

## Usage

### 1. Triggering Outbound Calls

```bash
curl -X POST http://localhost:3000/api/outbound-call \
  -H "Content-Type: application/json" \
  -d '{
    "patientData": {
      "id": "patient_123",
      "name": "राहुल शर्मा",
      "phoneNumber": "+911234567890",
      "treatmentType": "heart surgery consultation",
      "crmData": {
        "lastVisit": "2024-01-15",
        "doctor": "Dr. Smith",
        "department": "Cardiology"
      }
    }
  }'
```

### 2. Checking Call Status

```bash
curl http://localhost:3000/api/outbound-call/session-id-here
```

### 3. Getting All Active Calls

```bash
curl http://localhost:3000/api/outbound-calls
```

## Configuration

### Environment Variables
```env
# Knowlarity Configuration
KNOWLARITY_API_URL=https://api.knowlarity.com
KNOWLARITY_API_KEY=your-api-key
KNOWLARITY_ACCOUNT_ID=your-account-id
KNOWLARITY_CALLER_ID=your-caller-id
SERVER_WEBSOCKET_URL=wss://your-server.com/knowlarity-stream
```

## Call Flow

1. **API Trigger**: CRM system calls `/api/outbound-call` with patient data
2. **Call Initiation**: OutboundCallManager creates IVR flow and calls Knowlarity API
3. **Call Connection**: Knowlarity establishes call and connects to WebSocket stream
4. **ElevenLabs Integration**: WebSocket server creates ElevenLabs conversation
5. **Real-time Conversation**: Audio flows bidirectionally between Knowlarity ↔ ElevenLabs
6. **Data Collection**: ElevenLabs agent collects patient data through conversation
7. **Call Completion**: Data is saved via MCP, call session cleaned up

## IVR Flow Structure

```json
{
  "flow": {
    "nodes": [
      {
        "id": "welcome",
        "type": "play",
        "audio": {
          "type": "tts",
          "text": "कृपया एक क्षण प्रतीक्षा करें, हम आपको हमारे सहायक से जोड़ रहे हैं।",
          "language": "hi"
        },
        "next": "stream_node"
      },
      {
        "id": "stream_node",
        "type": "stream",
        "config": {
          "wss_url": "wss://your-server.com/knowlarity-stream/session-id",
          "sampling_rate": "16k",
          "metadata": "call_metadata_json"
        }
      }
    ]
  }
}
```

## Call States

- **initiating**: Call session created, preparing to dial
- **dialing**: Actively dialing the number
- **connected**: Call answered, audio streaming active
- **active**: Conversation in progress
- **completed**: Call finished successfully
- **failed**: Call failed (busy, no answer, error)
- **disconnected**: Connection lost

## Testing

Run the test script to verify functionality:

```bash
node test_outbound_call.js
```

## Error Handling

- **Automatic Retry**: Failed calls are retried up to 3 times
- **Timeout Management**: Calls timeout after 30 seconds
- **Connection Recovery**: WebSocket reconnection on failure
- **Status Tracking**: Complete audit trail of call attempts

## Monitoring

- Real-time call statistics via `/api/outbound-calls`
- Call session details via `/api/outbound-call/:sessionId`
- Webhook integration for external monitoring systems
- MCP analytics for conversation insights

## Security

- API key authentication for Knowlarity
- WebSocket connection validation
- Patient data encryption in transit
- Session-based access control

## Scaling Considerations

- Concurrent call limits based on Knowlarity plan
- WebSocket connection pooling
- Database optimization for call history
- Load balancing for high-volume scenarios