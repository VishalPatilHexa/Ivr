# Enhanced HexaHealth IVR System with ElevenLabs Agent

This enhanced IVR system integrates ElevenLabs Conversational AI agent with MCP (Model Context Protocol) for better functionality and data management.

## Features

### 🤖 ElevenLabs Agent Integration
- Direct connection to ElevenLabs conversational AI
- Natural speech-to-speech conversation flow
- Multilingual support (Hindi/English)
- Predefined conversation questions for patient data collection

### 📊 MCP (Model Context Protocol) Integration
- **Patient Data Management**: Save and retrieve patient information
- **Data Validation**: Validate patient data completeness and format
- **Analytics**: Get conversation analytics and insights
- **Data Export**: Export patient data in JSON/CSV formats
- **Conversation Tracking**: Track individual responses and summaries

### 🔄 Real-time WebSocket Communication
- Direct socket connection between frontend and ElevenLabs agent
- Real-time audio streaming
- Bidirectional communication
- Session management

## Architecture

```
Frontend (WebSocket) ↔ Server.js ↔ ElevenLabs Agent ↔ ElevenLabs API
                                        ↕
                                   MCP Server
                                        ↕
                              Data Storage & Analytics
```

## Setup Instructions

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `ELEVENLABS_API_KEY`: Your ElevenLabs API key
- `ELEVENLABS_AGENT_ID`: Your ElevenLabs agent ID
- `GEMINI_API_KEY`: Your Google Gemini API key (fallback)

### 2. Installation

```bash
npm install
```

### 3. Running the Application

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

#### Using Enhanced Server
```bash
node server-updated.js
```

## File Structure

```
├── services/
│   ├── elevenLabsAgent.js      # ElevenLabs agent integration
│   ├── elevenLabsService.js    # ElevenLabs API service
│   ├── speechService.js        # Speech processing service
│   └── conversationService.js  # Conversation management
├── mcp/
│   └── mcpServer.js            # Enhanced MCP server
├── public/
│   ├── index.html              # Frontend UI
│   ├── index.css               # Styling
│   ├── index.js                # Original frontend
│   └── index-updated.js        # Enhanced frontend
├── server.js                   # Original server
├── server-updated.js           # Enhanced server
└── README-enhanced.md          # This file
```

## API Endpoints

### Health Check
```
GET /health
```

### Analytics
```
GET /analytics?timeRange=all
```

### Data Export
```
GET /export?format=json
GET /export?format=csv
```

### Conversation Status
```
GET /conversation/:sessionId
```

## WebSocket Events

### Client → Server
- `start-conversation`: Start new conversation
- `audio-chunk`: Send audio data
- `text-message`: Send text message
- `end-conversation`: End conversation
- `get-conversation-data`: Get conversation data

### Server → Client
- `conversation-started`: Conversation started
- `agent_audio`: Audio from agent
- `agent_response`: Agent response
- `user-message`: User message confirmation
- `conversation-ended`: Conversation ended
- `conversation-data`: Conversation data
- `error`: Error message

## MCP Tools

### Patient Data Management
- `save_patient_data`: Save complete patient information
- `save_patient_response`: Save individual responses
- `save_conversation_summary`: Save conversation summaries

### Data Operations
- `validate_patient_data`: Validate patient data
- `get_conversation_analytics`: Get analytics
- `export_patient_data`: Export data

## Conversation Flow

1. **Connection**: Client connects via WebSocket
2. **Start**: Client sends `start-conversation` with query
3. **Agent Setup**: ElevenLabs agent is initialized
4. **Conversation**: Questions flow through predefined sequence:
   - Patient Name
   - Age
   - Gender
   - Health Issue
   - Duration
   - Severity (1-10)
   - City
   - Summary
5. **Data Collection**: Each response is saved via MCP
6. **Completion**: Final data is validated and stored

## Key Features

### Enhanced Error Handling
- Connection error recovery
- Audio processing errors
- Agent communication failures
- Data validation errors

### Session Management
- Unique session IDs
- Session cleanup
- Connection state tracking
- Graceful shutdowns

### Data Validation
- Required field validation
- Format validation
- Range validation
- Warning system

### Analytics & Reporting
- Conversation completion rates
- Common health issues
- Geographic distribution
- Age group analysis

## Usage Examples

### Starting a Conversation
```javascript
// Frontend
const client = new HexahealthElevenLabsClient();
// Connection and conversation start automatically
```

### Getting Analytics
```bash
curl "http://localhost:3000/analytics?timeRange=week"
```

### Exporting Data
```bash
# JSON format
curl "http://localhost:3000/export?format=json"

# CSV format
curl "http://localhost:3000/export?format=csv" -o patients.csv
```

## Troubleshooting

### Common Issues

1. **ElevenLabs Connection Error**
   - Check API key and agent ID
   - Verify network connectivity
   - Check agent status in ElevenLabs dashboard

2. **Audio Not Working**
   - Check microphone permissions
   - Verify audio format support
   - Check browser compatibility

3. **Data Not Saving**
   - Verify MCP tools are registered
   - Check console for errors
   - Validate data format

### Debug Mode
Set `NODE_ENV=development` for detailed logging.

## Security Considerations

- API keys should be kept secure
- WebSocket connections should be monitored
- Patient data should be handled according to privacy regulations
- Rate limiting is implemented for API protection

## Future Enhancements

- Database integration for persistent storage
- Authentication and authorization
- Advanced analytics dashboard
- Multi-language support expansion
- Integration with hospital systems

## Support

For issues and support, check the console logs and ensure all environment variables are properly configured.