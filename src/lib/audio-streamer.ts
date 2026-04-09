/**
 * Handles audio input (microphone) and output (speaker) for the Gemini Live API.
 */
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private isRecording = false;
  private onAudioData: (data: string) => void;

  constructor(onAudioData: (data: string) => void) {
    this.onAudioData = onAudioData;
  }

  async start() {
    if (this.isRecording) return;

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 256;

    // ScriptProcessor is deprecated but often easier for raw PCM handling in simple apps
    // Alternatively, use AudioWorklet for better performance
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.source.connect(this.analyzer);
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.floatToPcm16(inputData);
      const base64 = this.arrayBufferToBase64(pcm16.buffer);
      this.onAudioData(base64);
    };

    this.isRecording = true;
  }

  stop() {
    this.isRecording = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.processor?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
    this.audioContext = null;
  }

  getVolume() {
    if (!this.analyzer) return 0;
    const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
    this.analyzer.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    return average / 255;
  }

  private floatToPcm16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Plays back 24kHz PCM16 audio chunks.
   */
  private playbackContext: AudioContext | null = null;
  private nextStartTime = 0;

  playChunk(base64Data: string) {
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextStartTime = this.playbackContext.currentTime;
    }

    const binary = window.atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.playbackContext.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackContext.destination);

    const startTime = Math.max(this.nextStartTime, this.playbackContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  stopPlayback() {
    this.playbackContext?.close();
    this.playbackContext = null;
    this.nextStartTime = 0;
  }
}
