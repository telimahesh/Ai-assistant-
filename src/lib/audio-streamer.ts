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

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Your browser does not support microphone access. Please use a modern browser like Chrome.");
    }

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Resume context again after stream is acquired, some browsers need this
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
    } catch (err: any) {
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        throw new Error("Microphone permission denied. Please allow microphone access in your app settings.");
      }
      throw err;
    }

    if (!this.audioContext) return; // Handle case where stop() was called during getUserMedia

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

    // Initialize playback context during user gesture
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextStartTime = this.playbackContext.currentTime;
    } else if (this.playbackContext.state === "suspended") {
      await this.playbackContext.resume();
    }
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
   * Plays back 24kHz PCM16 audio chunks with subtle AI-like effects.
   */
  private playbackContext: AudioContext | null = null;
  private nextStartTime = 0;
  private reverbNode: ConvolverNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;

  private initPlaybackChain() {
    if (!this.playbackContext) return;

    // 1. High-pass filter for a cleaner, slightly more "digital" feel
    this.filterNode = this.playbackContext.createBiquadFilter();
    this.filterNode.type = "highpass";
    this.filterNode.frequency.value = 150; // Cut off muddy lows

    // 2. Compressor for consistent volume
    this.compressorNode = this.playbackContext.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-24, this.playbackContext.currentTime);
    this.compressorNode.knee.setValueAtTime(30, this.playbackContext.currentTime);
    this.compressorNode.ratio.setValueAtTime(12, this.playbackContext.currentTime);
    this.compressorNode.attack.setValueAtTime(0.003, this.playbackContext.currentTime);
    this.compressorNode.release.setValueAtTime(0.25, this.playbackContext.currentTime);

    // 3. Reverb for space
    this.reverbNode = this.playbackContext.createConvolver();
    this.reverbNode.buffer = this.createImpulseResponse(1.5, 4);

    // 4. Gains for mixing
    this.dryGain = this.playbackContext.createGain();
    this.wetGain = this.playbackContext.createGain();
    
    this.dryGain.gain.value = 0.8;
    this.wetGain.gain.value = 0.15; // Subtle reverb

    // Connect the chain
    // source -> filter -> compressor -> dryGain -> destination
    // source -> filter -> compressor -> reverb -> wetGain -> destination
    
    this.filterNode.connect(this.compressorNode);
    
    this.compressorNode.connect(this.dryGain);
    this.dryGain.connect(this.playbackContext.destination);
    
    this.compressorNode.connect(this.reverbNode);
    this.reverbNode.connect(this.wetGain);
    this.wetGain.connect(this.playbackContext.destination);
  }

  private createImpulseResponse(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.playbackContext!.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.playbackContext!.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const envelope = Math.pow(1 - n, decay);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

  playChunk(base64Data: string) {
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextStartTime = this.playbackContext.currentTime;
      this.initPlaybackChain();
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
    
    // Connect to the start of our effect chain
    if (this.filterNode) {
      source.connect(this.filterNode);
    } else {
      source.connect(this.playbackContext.destination);
    }

    const startTime = Math.max(this.nextStartTime, this.playbackContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  stopPlayback() {
    this.playbackContext?.close();
    this.playbackContext = null;
    this.nextStartTime = 0;
    this.reverbNode = null;
    this.filterNode = null;
    this.compressorNode = null;
    this.wetGain = null;
    this.dryGain = null;
  }
}
