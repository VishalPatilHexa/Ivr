# IVR Streaming Service Documentation

## Overview

This is an AI-powered voice streaming service that enables real-time conversation between callers and AI agents through various telephony providers.

## Architecture

The service is built with:
- **Express.js** - Web server framework
- **WebSocket** - Real-time bidirectional communication
- **ElevenLabs** - AI voice agent integration
- **Multiple Telephony Providers** - Knowlarity, Acephone support

## API Documentation

### Base URL
```
http://localhost:3010/api/v1
```

### Endpoints

#### Health Check
- `GET /health` - Service health status
- `GET /health/preop-assist` - PreOp assistant page

#### Streaming
- `POST /stream/call` - Initiate outbound call
- `GET /stream/phone-numbers` - Get available phone numbers
- `POST /stream/configure-phone` - Configure phone number
- `GET /stream/agent-info` - Get agent information
- `GET /stream/check-access` - Check conversational AI access

#### Webhooks
- `POST /webhook/elevenlabs/post-call` - ElevenLabs post-call webhook
- `GET /webhook/elevenlabs/health` - Webhook health check

## WebSocket Endpoints

### Knowlarity Integration
```
ws://localhost:3010/knowlarity-stream/{sessionId}
```

### Acephone Integration
```
ws://localhost:3010/acephone
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
PORT=3010
NODE_ENV=development

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_api_key
ELEVENLABS_AGENT_ID=your_agent_id

# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. For development with auto-reload:
   ```bash
   npm run dev
   ```

## Specifications

See `docs/specifications/` for detailed technical specifications:
- `IvrAcephone.pdf` - Acephone integration specifications
- `Knowlarity.pdf` - Knowlarity platform integration guide