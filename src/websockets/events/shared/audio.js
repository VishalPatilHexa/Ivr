/**
 * ===============================================================================
 * SHARED AUDIO UTILITIES
 * ===============================================================================
 *
 * Common audio processing functions used across different providers
 */

const Logger = require("../../../utils/logger");

/**
 * Amplify audio volume by multiplying sample values
 * Assumes 16-bit PCM audio (little endian)
 */
function amplifyAudioVolume(audioBuffer, amplificationFactor = 2.0) {
  try {
    // Create a copy to avoid modifying original buffer
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
    Logger.error("❌ Error amplifying audio", error);
    return audioBuffer; // Return original on error
  }
}

/**
 * Convert µ-law audio to PCM (ITU-T G.711 standard)
 */
function convertUlawToPcm(ulawBuffer) {
  const BIAS = 0x84;
  const pcmBuffer = Buffer.alloc(ulawBuffer.length * 2);

  for (let i = 0; i < ulawBuffer.length; i++) {
    let ulawSample = ~ulawBuffer[i];
    let sign = ulawSample & 0x80;
    let exponent = (ulawSample >> 4) & 0x07;
    let mantissa = ulawSample & 0x0f;

    let sample = (mantissa << 3) + BIAS;
    sample <<= exponent;

    if (sign) sample = -sample;

    // Clamp to 16-bit range
    sample = Math.max(-32768, Math.min(32767, sample));
    pcmBuffer.writeInt16LE(sample, i * 2);
  }

  return pcmBuffer;
}

/**
 * Convert linear PCM sample to µ-law (ITU-T G.711 standard)
 */
function linearToUlaw(sample) {
  const BIAS = 0x84;
  const CLIP = 8159;

  // Get sign and make sample positive
  let sign = sample < 0 ? 0x80 : 0x00;
  if (sample < 0) sample = -sample;

  // Clip sample to maximum value
  sample = Math.min(sample, CLIP);
  sample += BIAS;

  // Find exponent
  let exponent = 7;
  for (
    let expMask = 0x4000;
    (sample & expMask) === 0 && exponent > 0;
    exponent--, expMask >>= 1
  ) {}

  // Extract mantissa
  let mantissa = (sample >> (exponent + 3)) & 0x0f;

  // Construct µ-law sample
  let ulawSample = ~(sign | (exponent << 4) | mantissa);

  return ulawSample & 0xff;
}

/**
 * Convert PCM audio to µ-law
 */
function convertPcmToUlaw(pcmBuffer) {
  const ulawBuffer = Buffer.alloc(pcmBuffer.length / 2);

  for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
    const pcmSample = pcmBuffer.readInt16LE(i);
    const ulawSample = linearToUlaw(pcmSample);
    const outputIndex = i / 2;
    if (outputIndex < ulawBuffer.length) {
      ulawBuffer[outputIndex] = ulawSample;
    }
  }

  return ulawBuffer;
}

/**
 * Downsample PCM audio from 16kHz to 8kHz (simple decimation)
 */
function downsamplePcm16to8(pcm16Buffer) {
  const pcm8Buffer = Buffer.alloc(pcm16Buffer.length / 2);

  let outputIndex = 0;
  for (let i = 0; i < pcm16Buffer.length - 1; i += 4) {
    if (outputIndex < pcm8Buffer.length - 1) {
      const sample = pcm16Buffer.readInt16LE(i);
      pcm8Buffer.writeInt16LE(sample, outputIndex);
      outputIndex += 2;
    }
  }

  return pcm8Buffer;
}

/**
 * Upsample PCM audio from 8kHz to 16kHz (simple interpolation)
 */
function upsamplePcm8to16(pcm8Buffer) {
  const pcm16Buffer = Buffer.alloc(pcm8Buffer.length * 2);

  let outputIndex = 0;
  for (let i = 0; i < pcm8Buffer.length - 1; i += 2) {
    const sample = pcm8Buffer.readInt16LE(i);

    if (outputIndex < pcm16Buffer.length - 3) {
      pcm16Buffer.writeInt16LE(sample, outputIndex);
      pcm16Buffer.writeInt16LE(sample, outputIndex + 2);
      outputIndex += 4;
    }
  }

  return pcm16Buffer;
}

module.exports = {
  amplifyAudioVolume,
  convertUlawToPcm,
  convertPcmToUlaw,
  linearToUlaw,
  downsamplePcm16to8,
  upsamplePcm8to16,
};