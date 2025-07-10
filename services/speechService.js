const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

class SpeechService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async transcribeAudio(audioPath, prompt) {
    try {
      // Read the audio file
      const audioData = fs.readFileSync(audioPath);
      const audioBase64 = audioData.toString("base64");

      // Determine the MIME type based on file extension
      const mimeType = this.getMimeType(audioPath);

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
      ]);

      const response = await result.response;
      const transcription = response.text();

      let extractedJson;

      try {
        // Find the JSON string in the transcription using regex
        const jsonMatch = transcription.match(/```json([\s\S]*?)```/);

        if (jsonMatch && jsonMatch[1]) {
          // Parse the extracted JSON string
          extractedJson = JSON.parse(jsonMatch[1].trim());
          console.log("Extracted JSON:", extractedJson);
        } else {
          console.log("No valid JSON found in transcription.");
        }
      } catch (err) {
        console.error("Error parsing JSON:", err);
      }
      return extractedJson;
    } catch (error) {
      console.error("Transcription error:", error);
      throw new Error("Failed to transcribe audio");
    }
  }

  getMimeType(audioPath) {
    const extension = audioPath.split(".").pop().toLowerCase();
    const mimeTypes = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      flac: "audio/flac",
      aac: "audio/aac",
      ogg: "audio/ogg",
      webm: "audio/webm",
      m4a: "audio/mp4",
    };

    return mimeTypes[extension] || "audio/mpeg";
  }
}

module.exports = { SpeechService };
