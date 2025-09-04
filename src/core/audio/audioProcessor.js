const config = require('../../config');

/**
 * Process incoming audio from caller
 */
async function processIncomingAudio(audioBuffer, sessionId) {
  console.log(`🎵 Processing audio: ${audioBuffer.length} bytes for session: ${sessionId}`);

  try {
    // Audio format debugging
    logAudioDetails(audioBuffer);

    // Amplify audio volume
    const amplifiedAudio = amplifyAudio(audioBuffer, config.audio.amplificationFactor);

    // Convert to base64 for ElevenLabs
    const audioBase64 = amplifiedAudio.toString('base64');

    return {
      success: true,
      audioData: audioBase64,
      originalSize: audioBuffer.length,
      processedSize: amplifiedAudio.length
    };

  } catch (error) {
    console.error('❌ Audio processing failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Amplify audio volume
 */
function amplifyAudio(audioBuffer, amplificationFactor = 2.0) {
  try {
    const amplifiedBuffer = Buffer.from(audioBuffer);
    
    // Process 16-bit samples (2 bytes each)
    for (let i = 0; i < amplifiedBuffer.length - 1; i += 2) {
      // Read 16-bit little endian sample
      let sample = amplifiedBuffer.readInt16LE(i);
      
      // Amplify the sample
      sample = Math.round(sample * amplificationFactor);
      
      // Clamp to prevent overflow/distortion
      sample = Math.max(-32768, Math.min(32767, sample));
      
      // Write back the amplified sample
      amplifiedBuffer.writeInt16LE(sample, i);
    }
    
    return amplifiedBuffer;
    
  } catch (error) {
    console.error('❌ Audio amplification failed:', error.message);
    return audioBuffer; // Return original on error
  }
}

/**
 * Log audio details for debugging
 */
function logAudioDetails(audioBuffer) {
  const sampleCount = audioBuffer.length / 2;
  const duration = sampleCount / config.audio.sampleRate;
  
  console.log(`📊 Audio Details:
    - Size: ${audioBuffer.length} bytes
    - Samples: ${sampleCount}
    - Duration: ${duration.toFixed(3)} seconds
    - Sample Rate: ${config.audio.sampleRate} Hz`);

  // Log first few samples for debugging
  if (audioBuffer.length >= 6) {
    const samples = [
      audioBuffer.readInt16LE(0),
      audioBuffer.readInt16LE(2),
      audioBuffer.readInt16LE(4)
    ];
    console.log(`🎼 First 3 samples: ${samples.join(', ')}`);
    console.log(`🔊 Max amplitude: ${Math.max(...samples.map(Math.abs))}`);
  }
}

/**
 * Create playAudio message for Knowlarity
 */
function createPlayAudioMessage(base64AudioData) {
  return {
    type: "playAudio",
    data: {
      audioContentType: "raw",
      sampleRate: config.audio.sampleRate,
      audioContent: base64AudioData
    }
  };
}

module.exports = {
  processIncomingAudio,
  amplifyAudio,
  logAudioDetails,
  createPlayAudioMessage,
};