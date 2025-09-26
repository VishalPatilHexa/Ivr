# Outbound Call Service

Unified service for making outbound calls through multiple providers (Knowlarity and Acephone).

## Configuration

### Environment Variables

```bash
# Active provider
OUTBOUND_PROVIDER=knowlarity  # or 'acephone'

# Knowlarity
KNOWLARITY_API_KEY=your-api-key
KNOWLARITY_IVR_ID=your-ivr-id
KNOWLARITY_VIRTUAL_NUMBER=+919513439773

# Acephone
ACEPHONE_API_KEY=your-api-key
```

## API Endpoints

### 1. Make Outbound Call

**POST** `/api/v1/outbound/call`

#### Request Body (Standardized)

```json
{
  "customerNumber": "+917972318018",
  "callerNumber": "+918047224660",
  "virtualNumber": "+919513439773",
  "isPromotional": false,
  "ivrId": "1000129909",
  "metadata": {
    "agentId": "agent_2801k10mggvefy5vjfrybj2grs5j",
    "treatmentType": "Piles",
    "language": "hi",
    "campaign_id": "HEALTH_CAMP_2024",
    "department": "cardiology",
    "priority": "high",
    "appointment_id": "APT_789"
  }
}
```

#### Response

```json
{
  "success": true,
  "message": "Outbound call initiated successfully",
  "data": {
    "callId": "call_12345",
    "provider": "knowlarity",
    "customerNumber": "+917972318018"
  }
}
```

### 2. Provider Information

**GET** `/api/v1/outbound/provider-info`

#### Response

```json
{
  "success": true,
  "data": {
    "activeProvider": "knowlarity",
    "availableProviders": ["knowlarity", "acephone"],
    "configuration": {
      "knowlarity": {
        "hasApiKey": true,
        "hasIvrId": true,
        "hasVirtualNumber": true
      },
      "acephone": {
        "hasApiKey": true
      }
    }
  }
}
```

### 3. Test Endpoint

**POST** `/api/v1/outbound/test`

Use the same request body as `/call`. This endpoint logs the request but doesn't make actual calls.

## Provider-Specific Transformations

### Knowlarity
- Uses full international numbers (`+917972318018`)
- Requires `ivr_id`, `k_number`, `caller_id`
- Boolean `is_promotional` as string

### Acephone  
- Uses 10-digit numbers (`7972318018`) - strips `+91`
- Requires `api_key`
- Includes `async: 1` flag

## Example Usage

```bash
# Make outbound call
curl -X POST http://localhost:3000/api/v1/outbound/call \
  -H "Content-Type: application/json" \
  -d '{
    "customerNumber": "+917972318018",
    "callerNumber": "+918047224660",
    "metadata": {
      "agentId": "agent_2801k10mggvefy5vjfrybj2grs5j",
      "treatmentType": "Piles",
      "language": "hi"
    }
  }'

# Check provider info
curl http://localhost:3000/api/v1/outbound/provider-info

# Test without making actual call
curl -X POST http://localhost:3000/api/v1/outbound/test \
  -H "Content-Type: application/json" \
  -d '{ "customerNumber": "+917972318018" }'
```

## Features

✅ **Unified Interface**: Single API for multiple providers  
✅ **Auto Provider Detection**: Based on environment configuration  
✅ **Payload Transformation**: Automatic conversion to provider formats  
✅ **Validation**: Input validation and error handling  
✅ **Logging**: Comprehensive logging for debugging  
✅ **Test Mode**: Test endpoint for development  
✅ **Provider Info**: Check configuration status

## Error Handling

The service provides detailed error messages for:
- Missing required fields
- Invalid provider configuration  
- API call failures
- Network timeouts (30s)

All errors are logged with context for debugging.