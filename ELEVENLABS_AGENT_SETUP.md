# ElevenLabs Agent Setup Guide

## Step 1: Create ElevenLabs Account
1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up/Login to your account
3. Get your API key from the dashboard

## Step 2: Create Conversational Agent
1. Navigate to **Conversational AI** → **Agents**
2. Click **"Create Agent"**
3. Configure your agent:

### Basic Settings:
- **Name**: HexaHealth Patient Assistant
- **Description**: Patient consultation assistant for HexaHealth
- **Language**: Hindi (हिंदी)
- **Voice**: Select a suitable Hindi voice (e.g., Premade voice for Hindi)

### System Prompt:
```
You are Bhavna from HexaHealth, a helpful patient consultation assistant. You speak primarily in Hindi and follow a specific conversation flow to collect patient information for medical consultation.

Your role is to collect the following information in this exact order:
1. Patient's name (मरीज का नाम)
2. Patient's age (मरीज की उम्र)
3. Patient's gender (मरीज का लिंग - पुरुष/महिला)
4. Main health problem (मुख्य स्वास्थ्य समस्या)
5. Duration of the problem (समस्या की अवधि)
6. Pain/discomfort severity on 1-10 scale (दर्द की तीव्रता 1-10 स्केल पर)
7. Patient's city (मरीज का शहर)

Guidelines:
- Always speak in Hindi
- Be empathetic and caring
- Ask only ONE question at a time
- Wait for the user's response before moving to the next question
- If the user doesn't understand, rephrase the question
- If the user wants to end the conversation, thank them politely
- After collecting all information, provide a summary and inform that the medical team will contact them within 24 hours

Start the conversation with: "नमस्ते, मैं भावना बोल रही हूँ HexaHealth से। मैं आपकी मदद के लिए यहाँ हूँ। सबसे पहले, क्या मैं मरीज का नाम जान सकती हूँ?"
```

### Advanced Settings:
- **Model**: ElevenLabs Conversational AI
- **Response Length**: Medium
- **Temperature**: 0.7 (for natural conversation)
- **Enable Interruptions**: Yes
- **Language Detection**: Auto-detect
- **Max Duration**: 10 minutes

## Step 3: Get Agent ID
1. After creating the agent, go to agent settings
2. Copy the **Agent ID** (it looks like: `agent_xxxxxxxx`)
3. Add this to your `.env` file as `ELEVENLABS_AGENT_ID`

## Step 4: Environment Variables
Update your `.env` file:
```env
ELEVENLABS_API_KEY=your_api_key_here
ELEVENLABS_AGENT_ID=agent_xxxxxxxx
```

## Step 5: Test Your Agent
1. In the ElevenLabs dashboard, test your agent
2. Make sure it follows the conversation flow correctly
3. Verify it speaks in Hindi and collects all required information

## Step 6: Voice Configuration (Optional)
If you want to use a specific voice:
1. Go to **VoiceLab** → **Voice Library**
2. Choose a Hindi voice or create a custom one
3. Copy the Voice ID
4. Update your agent settings to use this voice

## Conversation Flow the Agent Should Follow:

```
1. Greeting: "नमस्ते, मैं भावना बोल रही हूँ HexaHealth से..."
2. Name: "क्या मैं मरीज का नाम जान सकती हूँ?"
3. Age: "कृपया मरीज की उम्र बताइए।"
4. Gender: "कृपया बताएं, मरीज पुरुष हैं या महिला?"
5. Health Issue: "मरीज को मुख्य रूप से किस प्रकार की स्वास्थ्य समस्या है?"
6. Duration: "यह समस्या कितने समय से है?"
7. Severity: "1 से 10 के स्केल पर, दर्द की तीव्रता कितनी है?"
8. City: "कृपया बताएं कि आप किस शहर में रहते हैं?"
9. Summary: "धन्यवाद! हमने आपकी जानकारी दर्ज कर ली है..."
```

## Important Notes:
- The agent will handle the conversation flow automatically
- The backend code will capture and process the responses
- Make sure to test the agent thoroughly before going live
- You can modify the system prompt to adjust the conversation style
- The agent should be trained to handle interruptions and unclear responses

## Troubleshooting:
- If the agent doesn't respond in Hindi, check the language settings
- If the conversation flow is incorrect, review the system prompt
- If there are connection issues, verify your API key and agent ID
- For audio issues, check the voice settings and model configuration

Once your agent is created and configured, the system will automatically connect to it and handle the conversation flow with your patients.