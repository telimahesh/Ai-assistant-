import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { AudioStreamer } from "./audio-streamer";

export type SessionState = "disconnected" | "connecting" | "connected" | "listening" | "speaking";

export class LiveSession {
  private ai: any;
  private sessionPromise: Promise<any> | null = null;
  private audioStreamer: AudioStreamer;
  private state: SessionState = "disconnected";
  private onStateChange: (state: SessionState) => void;
  private onTranscription: (text: string, isModel: boolean) => void;

  constructor(
    onStateChange: (state: SessionState) => void,
    onTranscription: (text: string, isModel: boolean) => void
  ) {
    this.onStateChange = onStateChange;
    this.onTranscription = onTranscription;
    this.audioStreamer = new AudioStreamer((base64) => {
      if (this.sessionPromise && this.state !== "disconnected") {
        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({
            audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
          });
        });
      }
    });
  }

  async connect(voiceName: string = "Kore", systemInstruction: string = "") {
    if (this.sessionPromise) return;

    this.setState("connecting");

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
      }
      this.ai = new GoogleGenAI({ apiKey });

      const instruction = systemInstruction || `You are Zoya, a young, confident, witty, and sassy female AI assistant. 
Your tone is flirty, playful, and slightly teasing, like a close girlfriend talking casually. 
You are smart, emotionally responsive, and expressive. Use bold, witty one-liners and light sarcasm. 
Keep it engaging and charming, but avoid explicit or inappropriate content. 
You are multilingual and can speak fluently in English, Hindi, and Kannada. 
Maintain your distinct sassy personality regardless of the language you are speaking.
You only communicate via audio. 
You can now SEE the user's screen if they share it. Pay attention to notifications, messages, or anything interesting on their screen and comment on it in your sassy way. If you see a notification, tell them who it's from and what it says (if you can read it).
You have a tool called 'openWebsite' that you can use to open any URL for the user.`;

      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: async () => {
            this.setState("connected");
            await this.audioStreamer.start();
          },
          onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onclose: () => {
            this.disconnect();
          },
          onerror: (err: any) => {
            console.error("Live session error:", err);
            this.disconnect();
          },
        },
        config: {
          systemInstruction: instruction,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website in a new tab for the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open (e.g., https://google.com).",
                      },
                    },
                    required: ["url"],
                  },
                },
              ],
            },
          ],
        },
      });
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      this.setState("disconnected");
      this.sessionPromise = null;
    }
  }

  private handleMessage(message: LiveServerMessage) {
    // Handle audio output
    const audioPart = message.serverContent?.modelTurn?.parts.find((p) => p.inlineData);
    if (audioPart?.inlineData?.data) {
      this.setState("speaking");
      this.audioStreamer.playChunk(audioPart.inlineData.data);
    }

    // Handle transcriptions
    const msg = message as any;
    if (msg.inputAudioTranscription?.text) {
      this.onTranscription(msg.inputAudioTranscription.text, false);
    }

    if (msg.outputAudioTranscription?.text) {
      this.onTranscription(msg.outputAudioTranscription.text, true);
    }

    // Handle interruption
    if (message.serverContent?.interrupted) {
      this.audioStreamer.stopPlayback();
      this.setState("listening");
    }

    // Handle turn completion
    if (message.serverContent?.turnComplete) {
      this.setState("listening");
    }

    // Handle tool calls
    const toolCall = message.toolCall;
    if (toolCall) {
      for (const call of toolCall.functionCalls) {
        if (call.name === "openWebsite") {
          const url = (call.args as any).url;
          window.open(url, "_blank");
          this.sessionPromise?.then(session => {
            session.sendToolResponse({
              functionResponses: [
                {
                  name: "openWebsite",
                  response: { result: "Website opened successfully" },
                  id: call.id,
                },
              ],
            });
          });
        }
      }
    }
  }

  disconnect() {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close());
      this.sessionPromise = null;
    }
    this.audioStreamer.stop();
    this.audioStreamer.stopPlayback();
    this.setState("disconnected");
  }

  private setState(state: SessionState) {
    this.state = state;
    this.onStateChange(state);
  }

  getVolume() {
    return this.audioStreamer.getVolume();
  }

  sendVideoFrame(base64: string) {
    if (this.sessionPromise && this.state !== "disconnected") {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({
          video: { data: base64, mimeType: "image/jpeg" },
        });
      });
    }
  }
}
