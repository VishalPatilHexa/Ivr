const twilio = require('twilio');
const { ElevenLabsService } = require('./elevenLabsService');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    console.log('Twilio config:', {
      accountSid: this.accountSid,
      authToken: this.authToken ? '***' : 'missing',
      phoneNumber: this.phoneNumber
    });
    
    if (!this.accountSid || !this.authToken || !this.phoneNumber) {
      throw new Error('Missing Twilio configuration. Check your .env file.');
    }
    
    this.client = twilio(this.accountSid, this.authToken);
    this.elevenLabsService = new ElevenLabsService();
  }

  async makeCall(to, message) {
    try {
      console.log('Making call with:', { to, from: this.phoneNumber, accountSid: this.accountSid });
      
      // Generate speech from text using ElevenLabs
      const audioBuffer = await this.elevenLabsService.synthesizeSpeech(message);
      
      // Create a call with Twilio
      const call = await this.client.calls.create({
        url: `http://13.233.10.184:3000/twilio/voice`,
        to: to,
        from: this.phoneNumber,
        method: 'POST'
      });

      console.log(`Call initiated: ${call.sid}`);
      return call;
    } catch (error) {
      console.error('Error making call:', error);
      console.error('Call parameters:', { to, from: this.phoneNumber, accountSid: this.accountSid });
      throw new Error('Failed to make call');
    }
  }

  generateTwiML(message) {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Say the message
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, message);

    // Add gather for input
    const gather = twiml.gather({
      input: 'speech',
      action: '/twilio/process-speech',
      method: 'POST',
      speechTimeout: 'auto'
    });

    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Please speak your response');

    return twiml.toString();
  }

  async generateTwiMLWithElevenLabs(message) {
    try {
      // Generate speech using ElevenLabs
      const audioBuffer = await this.elevenLabsService.synthesizeSpeech(message);
      
      // For now, we'll use Twilio's built-in TTS
      // In production, you'd upload the audio to a URL and use <Play>
      const twiml = new twilio.twiml.VoiceResponse();
      
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, message);

      // Add gather for input
      const gather = twiml.gather({
        input: 'speech',
        action: '/twilio/process-speech',
        method: 'POST',
        speechTimeout: 'auto'
      });

      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, 'Please speak your response');

      return twiml.toString();
    } catch (error) {
      console.error('Error generating TwiML with ElevenLabs:', error);
      return this.generateTwiML(message);
    }
  }

  async sendSMS(to, message) {
    try {
      const sms = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: to
      });

      console.log(`SMS sent: ${sms.sid}`);
      return sms;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw new Error('Failed to send SMS');
    }
  }

  async handleIncomingCall(callSid) {
    try {
      const call = await this.client.calls(callSid).fetch();
      console.log(`Incoming call from: ${call.from}`);
      return call;
    } catch (error) {
      console.error('Error handling incoming call:', error);
      throw new Error('Failed to handle incoming call');
    }
  }

  async endCall(callSid) {
    try {
      const call = await this.client.calls(callSid).update({
        status: 'completed'
      });
      console.log(`Call ended: ${call.sid}`);
      return call;
    } catch (error) {
      console.error('Error ending call:', error);
      throw new Error('Failed to end call');
    }
  }
}

module.exports = { TwilioService };